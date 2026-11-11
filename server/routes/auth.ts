import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, tx } from '../db.ts';
import { HttpError, bad, hashSecret, newToken, now, sha256, shortCode, uid, verifySecret } from '../lib.ts';
import { COOKIE, SESSION_MS, publicUser, rateLimit, requireAuth } from '../http.ts';
import { getUser, notify, type User } from '../services.ts';
import { cardsProvider, kyc } from '../providers.ts';
import { award } from '../game.ts';

export const auth = Router();

const password = z.string().min(8, 'Use at least 8 characters.').max(128);
const email = z.string().trim().toLowerCase().email('Enter a valid email.');

function startSession(res: any, req: any, userId: string) {
  const token = newToken();
  run('INSERT INTO sessions (token_hash,user_id,user_agent,created_at,expires_at) VALUES (?,?,?,?,?)',
    sha256(token), userId, String(req.headers['user-agent'] ?? '').slice(0, 200), now(), now() + SESSION_MS);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' && !process.env.INSECURE_COOKIES, maxAge: SESSION_MS, path: '/' });
}

export function createUser(o: { role: 'teen' | 'parent'; name: string; email: string; password: string; dob?: string; avatar?: string; isDemo?: boolean }) {
  return tx(() => {
    const id = uid();
    const base = o.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 16) || 'player';
    let handle = `${base}@levelup`;
    while (get('SELECT 1 FROM users WHERE handle = ?', handle)) handle = `${base}${Math.floor(Math.random() * 900 + 100)}@levelup`;
    run(`INSERT INTO users (id,role,name,email,handle,password_hash,dob,avatar,family_code,is_demo,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id, o.role, o.name, o.email, handle, hashSecret(o.password), o.dob ?? null, o.avatar ?? (o.role === 'teen' ? '🦊' : '🦉'),
      o.role === 'teen' ? shortCode(6) : null, o.isDemo ? 1 : 0, now());
    if (o.role === 'teen') {
      run('INSERT INTO wallets (user_id, balance) VALUES (?, 0)', id);
      const c = cardsProvider.issueVirtualCard(id);
      run('INSERT INTO cards (user_id,last4,expiry) VALUES (?,?,?)', id, c.last4, c.expiry);
    }
    return getUser(id)!;
  });
}

auth.post('/register', (req, res) => {
  const body = z.object({
    role: z.enum(['teen', 'parent']), name: z.string().trim().min(2, 'Tell us your name.').max(60), email, password,
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), familyCode: z.string().trim().toUpperCase().optional(),
  }).parse(req.body);
  rateLimit(`reg:${req.ip}`, 10, 10 * 60000);
  if (get('SELECT 1 FROM users WHERE email = ?', body.email)) throw bad('EMAIL_TAKEN', 'An account with this email already exists.');
  if (body.role === 'teen') {
    if (!body.dob) throw bad('DOB_REQUIRED', 'Add your date of birth.');
    const age = (now() - Date.parse(body.dob)) / (365.25 * 24 * 3600 * 1000);
    if (!(age >= 13 && age < 100)) throw bad('AGE', 'LevelUp is for ages 13 and up.');
  }
  let child: User | undefined;
  if (body.role === 'parent' && body.familyCode) {
    child = get<User>('SELECT * FROM users WHERE family_code = ?', body.familyCode);
    if (!child) throw bad('BAD_FAMILY_CODE', "We couldn't find that family code.");
    if (child.parent_id) throw bad('ALREADY_LINKED', 'That account is already linked to a parent.');
  }
  const u = createUser(body);
  if (child) {
    run('UPDATE users SET parent_id = ? WHERE id = ?', u.id, child.id);
    notify(child.id, 'system', `${u.name} joined as your parent`, 'They can now send allowance and help with limits.', '/app/profile');
  }
  if (u.role === 'teen') {
    award(u.id, 50, 100, 'Welcome bonus');
    notify(u.id, 'system', 'Welcome to LevelUp ⚡', 'Add demo money, create a vault and start your first mission.', '/app/rewards');
  } else {
    notify(u.id, 'system', 'Welcome to LevelUp', child ? `You're linked to ${child.name}.` : 'Link your child with their family code to get started.', '/parent');
  }
  startSession(res, req, u.id);
  res.status(201).json({ user: publicUser(getUser(u.id)!) });
});

auth.post('/login', (req, res) => {
  const body = z.object({ email, password: z.string().min(1).max(128) }).parse(req.body);
  rateLimit(`login:${req.ip}:${body.email}`, 8, 10 * 60000);
  const u = get<User>('SELECT * FROM users WHERE email = ?', body.email);
  // Same error for unknown email and wrong password.
  if (!u || !verifySecret(body.password, u.password_hash)) throw new HttpError(401, 'BAD_CREDENTIALS', 'Email or password is incorrect.');
  startSession(res, req, u.id);
  res.json({ user: publicUser(u) });
});

auth.post('/logout', (req, res) => {
  if (req.sessionHash) run('DELETE FROM sessions WHERE token_hash = ?', req.sessionHash);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

export const me = Router();
// Signed-out visitors get a clean null rather than a 401, so the app shell can boot quietly.
me.get('/', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));
me.use(requireAuth);

me.patch('/', (req, res) => {
  const b = z.object({
    name: z.string().trim().min(2).max(60).optional(), avatar: z.string().max(8).optional(),
    monthlyBudget: z.number().int().min(50000).max(10000000).optional(), savingsTarget: z.number().int().min(10000).max(10000000).optional(),
    settings: z.object({ hideBalance: z.boolean(), biometric: z.boolean(), notifyPush: z.boolean(), notifyEmail: z.boolean(), notifyRewards: z.boolean() }).partial().optional(),
    onboarded: z.literal(true).optional(),
  }).parse(req.body);
  const u = req.user!;
  const settings = { ...JSON.parse(u.settings || '{}'), ...(b.settings ?? {}) };
  run('UPDATE users SET name = ?, avatar = ?, monthly_budget = ?, savings_target = ?, settings = ?, onboarded = ? WHERE id = ?',
    b.name ?? u.name, b.avatar ?? u.avatar, b.monthlyBudget ?? u.monthly_budget, b.savingsTarget ?? u.savings_target,
    JSON.stringify(settings), b.onboarded ? 1 : u.onboarded, u.id);
  res.json({ user: publicUser(getUser(u.id)!) });
});

me.post('/password', (req, res) => {
  const b = z.object({ current: z.string().min(1), next: password }).parse(req.body);
  const u = req.user!;
  rateLimit(`pw:${u.id}`, 6, 10 * 60000);
  if (!verifySecret(b.current, u.password_hash)) throw bad('BAD_CREDENTIALS', 'Current password is incorrect.');
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashSecret(b.next), u.id);
  // Changing the password signs out every other device.
  run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', u.id, req.sessionHash!);
  notify(u.id, 'security', 'Password changed', 'Other devices were signed out. If this was not you, change it again now.', '/app/settings');
  res.json({ ok: true });
});

me.post('/pin', (req, res) => {
  const b = z.object({ pin: z.string().regex(/^\d{4}$/, 'PIN must be 4 digits.'), password: z.string().optional() }).parse(req.body);
  const u = req.user!;
  if (['1234', '0000', '1111'].includes(b.pin) && !u.is_demo) throw bad('WEAK_PIN', 'That PIN is too easy to guess. Pick another.');
  // Setting a PIN for the first time is free; changing it needs the password.
  if (u.pin_hash) {
    rateLimit(`pin:${u.id}`, 6, 10 * 60000);
    if (!b.password || !verifySecret(b.password, u.password_hash)) throw bad('BAD_CREDENTIALS', 'Enter your account password to change your PIN.');
  }
  run('UPDATE users SET pin_hash = ?, pin_fails = 0, pin_locked_until = 0 WHERE id = ?', hashSecret(b.pin), u.id);
  notify(u.id, 'security', u.pin_hash ? 'LevelUp PIN changed' : 'LevelUp PIN set', 'Your PIN protects payments and card details.', '/app/settings');
  res.json({ user: publicUser(getUser(u.id)!) });
});

me.get('/sessions', (req, res) => {
  const rows = all<any>('SELECT token_hash, user_agent, created_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC', req.user!.id, now());
  res.json({ sessions: rows.map((s) => ({ id: s.token_hash.slice(0, 12), userAgent: s.user_agent, createdAt: s.created_at, current: s.token_hash === req.sessionHash })) });
});
me.post('/sessions/revoke-others', (req, res) => {
  const r = run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', req.user!.id, req.sessionHash!);
  res.json({ revoked: Number(r.changes) });
});

// Demonstration only: no identity documents are collected, stored or verified.
me.post('/kyc', (req, res) => {
  const b = z.object({ docType: z.enum(['aadhaar', 'pan', 'student_id']) }).parse(req.body);
  const u = req.user!;
  const r = kyc.verify(u.id, b);
  run('UPDATE users SET kyc_status = ? WHERE id = ?', r.status, u.id);
  if (u.kyc_status !== 'demo_verified' && u.role === 'teen') award(u.id, 30, 20, 'Completed demo verification');
  notify(u.id, 'system', 'Demo verification complete', 'This was a walkthrough only. No documents were collected.', '/app/profile');
  res.json({ user: publicUser(getUser(u.id)!), ref: r.ref });
});

me.get('/notifications', (req, res) => {
  const rows = all<any>('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 60', req.user!.id);
  res.json({ notifications: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: !!n.read, createdAt: n.created_at })) });
});
me.post('/notifications/read', (req, res) => {
  const b = z.object({ id: z.string().optional() }).parse(req.body ?? {});
  if (b.id) run('UPDATE notifications SET read = 1 WHERE user_id = ? AND id = ?', req.user!.id, b.id);
  else run('UPDATE notifications SET read = 1 WHERE user_id = ?', req.user!.id);
  res.json({ ok: true });
});

import type { Request, Response, NextFunction } from 'express';
import { get, run } from './db.ts';
import { HttpError, bad, now, sha256 } from './lib.ts';
import { verifySecret } from './lib.ts';
import { balanceOf, getUser, type User } from './services.ts';
import { currentStreak } from './game.ts';
import { levelInfo } from '../shared/constants.ts';

export const COOKIE = 'lu_session';
export const SESSION_MS = 14 * 24 * 3600 * 1000;

declare module 'express-serve-static-core' {
  interface Request { user?: User; sessionHash?: string }
}

function readCookie(req: Request, name: string) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token = readCookie(req, COOKIE);
  if (token) {
    const hash = sha256(token);
    const s = get<{ user_id: string; expires_at: number }>('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?', hash);
    if (s && s.expires_at > now()) {
      req.user = getUser(s.user_id);
      req.sessionHash = hash;
    }
  }
  next();
}

/** State-changing requests must carry a custom header, which browsers will not send cross-site without CORS approval. */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-levelup-client'] !== 'web') {
    throw new HttpError(403, 'CSRF', 'Request blocked.');
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in.');
  next();
}
export const requireRole = (role: User['role']) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in.');
  if (req.user.role !== role) throw new HttpError(403, 'FORBIDDEN', 'Your account cannot access this.');
  next();
};

export function verifyPin(u: User, pin: string | undefined) {
  if (!u.pin_hash) throw bad('PIN_NOT_SET', 'Set a LevelUp PIN to continue.');
  if (u.pin_locked_until > now()) {
    throw new HttpError(429, 'PIN_LOCKED', `Too many wrong attempts. Try again in ${Math.ceil((u.pin_locked_until - now()) / 60000)} min.`);
  }
  if (!pin || !verifySecret(pin, u.pin_hash)) {
    const fails = u.pin_fails + 1;
    if (fails >= 5) run('UPDATE users SET pin_fails = 0, pin_locked_until = ? WHERE id = ?', now() + 5 * 60000, u.id);
    else run('UPDATE users SET pin_fails = ? WHERE id = ?', fails, u.id);
    throw bad('PIN_INVALID', fails >= 5 ? 'Wrong PIN. Payments are locked for 5 minutes.' : `Wrong PIN. ${5 - fails} attempts left.`);
  }
  if (u.pin_fails) run('UPDATE users SET pin_fails = 0 WHERE id = ?', u.id);
}

// Tiny in-memory limiter for credential endpoints.
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const t = now(), h = hits.get(key);
  if (!h || h.reset < t) { hits.set(key, { n: 1, reset: t + windowMs }); return; }
  if (++h.n > max) throw new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a few minutes.');
}

export function publicUser(u: User) {
  const parent = u.parent_id ? getUser(u.parent_id) : undefined;
  const unread = get<{ n: number }>('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read = 0', u.id)!.n;
  return {
    id: u.id, role: u.role, name: u.name, email: u.email, handle: u.handle, avatar: u.avatar, dob: u.dob,
    kycStatus: u.kyc_status, onboarded: !!u.onboarded, isDemo: !!u.is_demo, hasPin: !!u.pin_hash,
    familyCode: u.family_code, parent: parent ? { name: parent.name, avatar: parent.avatar } : null,
    monthlyBudget: u.monthly_budget, savingsTarget: u.savings_target, settings: JSON.parse(u.settings || '{}'),
    level: levelInfo(u.xp), coins: u.coins, streak: currentStreak(u), balance: u.role === 'teen' ? balanceOf(u.id) : 0,
    unread, createdAt: u.created_at,
  };
}

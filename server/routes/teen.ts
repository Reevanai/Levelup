import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, tx } from '../db.ts';
import { HttpError, bad, istDay, now, rupees, startOfMonth, startOfWeek, uid } from '../lib.ts';
import { requireRole, verifyPin, publicUser } from '../http.ts';
import {
  balanceOf, categoryBreakdown, createApproval, declineReason, executeCardSpend, getCard, getUser, notify, postDeclined,
  postTxn, publicCard, publicTxn, sumIncome, sumSaved, sumSpend, vaultMove, type Txn, type User,
} from '../services.ts';
import { cardsProvider, funding, transfers } from '../providers.ts';
import { award, badgesFor, checkIn, claimMission, currentStreak, evaluateBadges, leaderboard, missionsFor, ownsHolo, redeem, REWARDS } from '../game.ts';
import { QUIZZES, ask, buildInsights, dailySpend, healthScore, monthlyReport, monthlyTrend, savingsSuggestion } from '../insights.ts';
import { CARD_DESIGNS, CATEGORY_KEYS, levelInfo } from '../../shared/constants.ts';

export const teen = Router();
teen.use(requireRole('teen'));

const amount = (max = 10_000_000) => z.number().int('Whole paise only.').positive('Enter an amount.').max(max, `Maximum is ${rupees(max)}.`);
const WALLET_CAP = 10_000_000; // ₹1,00,000 demo cap
const pin = z.string().optional();

const CONTACTS = [
  { handle: 'kabir@levelup', name: 'Kabir R.', avatar: '🐺' }, { handle: 'meera@levelup', name: 'Meera S.', avatar: '🦋' },
  { handle: 'ishaan@levelup', name: 'Ishaan K.', avatar: '🐯' }, { handle: 'ananya@levelup', name: 'Ananya P.', avatar: '🦄' },
  { handle: 'zoya@levelup', name: 'Zoya M.', avatar: '🐼' },
];
const handleSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{2,24}@levelup$/, 'Handles look like name@levelup.');
const lookup = (handle: string) => CONTACTS.find((c) => c.handle === handle) ?? { handle, name: handle.split('@')[0], avatar: '👤' };
const vaultView = (v: any) => ({ id: v.id, name: v.name, emoji: v.emoji, color: v.color, target: v.target, saved: v.saved, targetDate: v.target_date, completedAt: v.completed_at, createdAt: v.created_at });
const fresh = (u: User) => ({ user: publicUser(getUser(u.id)!), badges: evaluateBadges(u.id) });

// ---------- dashboard ----------
teen.get('/dashboard', (req, res) => {
  const u = req.user!, t = now(), m0 = startOfMonth(t);
  const vaults = all<any>('SELECT * FROM vaults WHERE user_id = ? ORDER BY created_at', u.id);
  const missions = missionsFor(u);
  res.json({
    balance: balanceOf(u.id), monthSpent: sumSpend(u.id, m0), monthReceived: sumIncome(u.id, m0), monthSaved: Math.max(0, sumSaved(u.id, m0)),
    weekSpent: sumSpend(u.id, startOfWeek(t)), budget: u.monthly_budget, savingsTarget: u.savings_target,
    recent: all<Txn>('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 6', u.id).map(publicTxn),
    vaults: vaults.map(vaultView), totalSaved: vaults.reduce((a, v) => a + v.saved, 0), totalTarget: vaults.reduce((a, v) => a + v.target, 0),
    level: levelInfo(u.xp), coins: u.coins, streak: currentStreak(u), checkedInToday: u.streak_day === istDay(t),
    health: healthScore(u), daily: dailySpend(u.id, 7), categories: categoryBreakdown(u.id, m0),
    missions: missions.filter((m) => m.status !== 'claimed').slice(0, 3), claimable: missions.filter((m) => m.status === 'claimable').length,
    topInsight: buildInsights(u).find((i) => i.tone === 'warn') ?? buildInsights(u)[0] ?? null,
    cardFrozen: !!getCard(u.id).frozen || !!getCard(u.id).parent_locked, card: { design: getCard(u.id).design, last4: getCard(u.id).last4 },
  });
});

// ---------- wallet ----------
teen.get('/wallet', (req, res) => {
  const u = req.user!, m0 = startOfMonth(now());
  res.json({
    balance: balanceOf(u.id), handle: u.handle, monthSpent: sumSpend(u.id, m0), monthReceived: sumIncome(u.id, m0),
    categories: categoryBreakdown(u.id, m0), contacts: CONTACTS, hasParent: !!u.parent_id, cap: WALLET_CAP,
    requests: all<any>(`SELECT * FROM money_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`, u.id)
      .map((r) => ({ id: r.id, fromName: r.from_name, fromHandle: r.from_handle, amount: r.amount, note: r.note, status: r.status, viaParent: !!r.approval_id, createdAt: r.created_at })),
  });
});

teen.get('/transactions', (req, res) => {
  const q = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(30), before: z.coerce.number().optional(),
    direction: z.enum(['credit', 'debit']).optional(), category: z.string().max(20).optional(), q: z.string().max(40).optional(),
  }).parse(req.query);
  const where = ['user_id = ?']; const p: (string | number)[] = [req.user!.id];
  if (q.before) { where.push('created_at < ?'); p.push(q.before); }
  if (q.direction) { where.push('direction = ?'); p.push(q.direction); }
  if (q.category) { where.push('category = ?'); p.push(q.category); }
  if (q.q) { where.push("(title LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\')"); const like = `%${q.q.replace(/[\\%_]/g, '\\$&')}%`; p.push(like, like); }
  const rows = all<Txn>(`SELECT * FROM transactions WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`, ...p, q.limit + 1);
  const items = rows.slice(0, q.limit);
  res.json({ items: items.map(publicTxn), nextBefore: rows.length > q.limit ? items[items.length - 1].created_at : null });
});

teen.get('/transactions/:id', (req, res) => {
  const t = get<Txn>('SELECT * FROM transactions WHERE id = ? AND user_id = ?', req.params.id, req.user!.id);
  if (!t) throw new HttpError(404, 'NOT_FOUND', 'Transaction not found.');
  res.json({ txn: publicTxn(t), holder: req.user!.name, handle: req.user!.handle });
});

teen.post('/wallet/add', (req, res) => {
  const b = z.object({ amount: amount(1_000_000), source: z.enum(['demo_bank', 'demo_upi']) }).parse(req.body);
  const u = req.user!;
  if (balanceOf(u.id) + b.amount > WALLET_CAP) throw bad('WALLET_CAP', `Demo wallets hold up to ${rupees(WALLET_CAP)}.`);
  const r = funding.collect(u.id, b.amount, b.source);
  if (!r.ok) throw bad('FUNDING_FAILED', r.reason ?? 'Could not add money.');
  const t = postTxn({ userId: u.id, direction: 'credit', amount: b.amount, kind: 'topup', category: 'income', title: 'Added demo money',
    subtitle: b.source === 'demo_bank' ? 'Demo bank account' : 'Demo UPI app', method: 'Simulated top-up', ref: r.ref });
  notify(u.id, 'txn', `${rupees(b.amount)} added`, `Simulated top-up · balance ${rupees(t.balance_after)}`, `/app/txn/${t.id}`);
  res.json({ txn: publicTxn(t), ...fresh(u) });
});

teen.post('/wallet/send', (req, res) => {
  const b = z.object({ amount: amount(2_000_000), to: handleSchema, note: z.string().trim().max(80).optional(), pin }).parse(req.body);
  const u = req.user!;
  if (b.to === u.handle) throw bad('SELF_TRANSFER', "You can't send money to yourself.");
  verifyPin(u, b.pin);
  if (getCard(u.id).parent_locked) throw bad('LOCKED', 'Payments are locked by your parent.');
  const out = tx(() => {
    const who = lookup(b.to);
    const recipient = get<User>(`SELECT * FROM users WHERE handle = ? AND role = 'teen'`, b.to);
    const r = transfers.payout(u.id, b.amount, b.to);
    const t = postTxn({ userId: u.id, direction: 'debit', amount: b.amount, kind: 'transfer', category: 'other', title: `To ${recipient?.name ?? who.name}`,
      subtitle: b.to, note: b.note, method: 'Wallet transfer (simulated)', ref: r.ref });
    if (recipient) {
      const c = postTxn({ userId: recipient.id, direction: 'credit', amount: b.amount, kind: 'transfer', category: 'income', title: `From ${u.name}`,
        subtitle: u.handle, note: b.note, method: 'Wallet transfer (simulated)', ref: r.ref });
      notify(recipient.id, 'txn', `${u.name} sent you ${rupees(b.amount)}`, b.note ?? 'Wallet transfer', `/app/txn/${c.id}`);
    }
    return t;
  });
  notify(u.id, 'txn', `Sent ${rupees(b.amount)}`, `${out.title} · balance ${rupees(out.balance_after)}`, `/app/txn/${out.id}`);
  if (u.parent_id) notify(u.parent_id, 'child_spend', `${u.name.split(' ')[0]} sent ${rupees(b.amount)}`, out.title, '/parent');
  res.json({ txn: publicTxn(out), ...fresh(u) });
});

teen.post('/wallet/request', (req, res) => {
  const b = z.object({ amount: amount(1_000_000), from: z.union([z.literal('parent'), handleSchema]), note: z.string().trim().max(80).optional() }).parse(req.body);
  const u = req.user!;
  const id = uid();
  tx(() => {
    if (b.from === 'parent') {
      const parent = u.parent_id ? getUser(u.parent_id) : null;
      if (!parent) throw bad('NO_PARENT', 'Link a parent account first. Share your family code from Profile.');
      const approvalId = createApproval(u, 'money_request', `Requested ${rupees(b.amount)}`, b.note ?? 'Money request', b.amount, { note: b.note });
      run('INSERT INTO money_requests (id,user_id,from_name,from_handle,amount,note,approval_id,created_at) VALUES (?,?,?,?,?,?,?,?)',
        id, u.id, parent.name, parent.handle, b.amount, b.note ?? null, approvalId, now());
    } else {
      if (b.from === u.handle) throw bad('SELF_TRANSFER', "You can't request money from yourself.");
      const who = lookup(b.from);
      run('INSERT INTO money_requests (id,user_id,from_name,from_handle,amount,note,created_at) VALUES (?,?,?,?,?,?,?)', id, u.id, who.name, b.from, b.amount, b.note ?? null, now());
    }
  });
  res.status(201).json({ id });
});

// Prototype helper: plays the part of the friend paying the request.
teen.post('/wallet/requests/:id/:action', (req, res) => {
  const u = req.user!;
  const action = z.enum(['simulate', 'cancel']).parse(req.params.action);
  const r = get<any>('SELECT * FROM money_requests WHERE id = ? AND user_id = ?', req.params.id, u.id);
  if (!r) throw new HttpError(404, 'NOT_FOUND', 'Request not found.');
  if (r.status !== 'pending') throw bad('NOT_PENDING', 'This request is already closed.');
  if (action === 'cancel') {
    tx(() => {
      run(`UPDATE money_requests SET status = 'cancelled' WHERE id = ?`, r.id);
      if (r.approval_id) run(`UPDATE approvals SET status = 'declined', resolved_at = ? WHERE id = ? AND status = 'pending'`, now(), r.approval_id);
    });
    return res.json({ status: 'cancelled' });
  }
  if (r.approval_id) throw bad('NEEDS_PARENT', 'This one is waiting for your parent. Sign in as the parent to approve it.');
  const t = tx(() => {
    run(`UPDATE money_requests SET status = 'paid' WHERE id = ?`, r.id);
    return postTxn({ userId: u.id, direction: 'credit', amount: r.amount, kind: 'transfer', category: 'income', title: `From ${r.from_name}`,
      subtitle: r.from_handle, note: r.note, method: 'Wallet transfer (simulated)' });
  });
  notify(u.id, 'txn', `${r.from_name} paid your request`, `${rupees(r.amount)} added · balance ${rupees(t.balance_after)}`, `/app/txn/${t.id}`);
  res.json({ status: 'paid', txn: publicTxn(t), ...fresh(u) });
});

// Simulated merchant checkout using the virtual card.
teen.post('/wallet/pay', (req, res) => {
  const b = z.object({ amount: amount(5_000_000), merchant: z.string().trim().min(2).max(40), category: z.enum(CATEGORY_KEYS),
    channel: z.enum(['online', 'instore']), note: z.string().trim().max(80).optional(), pin }).parse(req.body);
  const u = req.user!;
  verifyPin(u, b.pin);
  const spend = { amount: b.amount, merchant: b.merchant, category: b.category, channel: b.channel, note: b.note };
  const why = declineReason(u, spend);
  if (why) {
    const id = postDeclined(u.id, b.amount, b.category, b.merchant, why);
    notify(u.id, 'txn', `Payment declined at ${b.merchant}`, why, `/app/txn/${id}`);
    throw bad('DECLINED', why, { txnId: id });
  }
  const c = getCard(u.id);
  if (u.parent_id && c.approval_threshold > 0 && b.amount > c.approval_threshold) {
    createApproval(u, 'purchase', `Pay ${rupees(b.amount)} at ${b.merchant}`, `Over the ${rupees(c.approval_threshold)} approval limit`, b.amount, spend);
    return res.status(202).json({ status: 'pending_approval', message: `Payments over ${rupees(c.approval_threshold)} need your parent's OK. We've asked them.` });
  }
  const t = executeCardSpend(u, spend);
  res.json({ status: 'paid', txn: publicTxn(t), ...fresh(u) });
});

// ---------- card ----------
const cardPayload = (u: User) => ({
  card: publicCard(getCard(u.id), u.id), holder: u.name, hasParent: !!u.parent_id, holoUnlocked: ownsHolo(u.id),
  pendingLimits: all<any>(`SELECT id, title, created_at FROM approvals WHERE child_id = ? AND type = 'limit_increase' AND status = 'pending'`, u.id),
  recent: all<Txn>(`SELECT * FROM transactions WHERE user_id = ? AND kind = 'card' ORDER BY created_at DESC LIMIT 8`, u.id).map(publicTxn),
});
teen.get('/card', (req, res) => res.json(cardPayload(req.user!)));

teen.patch('/card', (req, res) => {
  const lim = z.number().int().min(10000, 'Minimum limit is ₹100.').max(5_000_000, 'Maximum limit is ₹50,000.').optional();
  const b = z.object({ design: z.string().optional(), frozen: z.boolean().optional(), onlineEnabled: z.boolean().optional(), instoreEnabled: z.boolean().optional(),
    internationalEnabled: z.boolean().optional(), notifyTxn: z.boolean().optional(), perTxnLimit: lim, dailyLimit: lim, monthlyLimit: lim }).parse(req.body);
  const u = req.user!, c = getCard(u.id);
  const requested: string[] = [];
  tx(() => {
    if (b.design !== undefined) {
      if (!CARD_DESIGNS.some((d) => d.key === b.design)) throw bad('BAD_DESIGN', 'Unknown card design.');
      if (b.design === 'holo' && !ownsHolo(u.id)) throw bad('LOCKED_DESIGN', 'Unlock the Holo skin in the reward store first.');
      run('UPDATE cards SET design = ? WHERE user_id = ?', b.design, u.id);
    }
    if (b.frozen !== undefined) {
      if (!b.frozen && c.parent_locked) throw bad('PARENT_LOCKED', 'Your parent locked this card. Ask them to unlock it.');
      run('UPDATE cards SET frozen = ? WHERE user_id = ?', b.frozen ? 1 : 0, u.id);
      notify(u.id, 'security', b.frozen ? 'Card frozen ❄️' : 'Card unfrozen', b.frozen ? 'All card payments are blocked until you unfreeze.' : 'Your card is ready to use again.', '/app/cards');
    }
    const toggles: [boolean | undefined, string][] = [[b.onlineEnabled, 'online_enabled'], [b.instoreEnabled, 'instore_enabled'], [b.internationalEnabled, 'international_enabled'], [b.notifyTxn, 'notify_txn']];
    for (const [v, col] of toggles) {
      if (v === undefined) continue;
      run(`UPDATE cards SET ${col} = ? WHERE user_id = ?`, v ? 1 : 0, u.id);
    }
    const limits: [number | undefined, string, 'perTxnLimit' | 'dailyLimit' | 'monthlyLimit', string][] = [
      [b.perTxnLimit, 'per_txn_limit', 'perTxnLimit', 'per-payment'], [b.dailyLimit, 'daily_limit', 'dailyLimit', 'daily'], [b.monthlyLimit, 'monthly_limit', 'monthlyLimit', 'monthly']];
    for (const [v, col, field, label] of limits) {
      if (v === undefined || v === (c as any)[col]) continue;
      // Lowering a limit is always instant. Raising one needs a linked parent's approval.
      if (u.parent_id && v > (c as any)[col]) {
        run(`UPDATE approvals SET status = 'declined', resolved_at = ? WHERE child_id = ? AND type = 'limit_increase' AND status = 'pending' AND json_extract(payload,'$.field') = ?`, now(), u.id, field);
        createApproval(u, 'limit_increase', `Raise ${label} limit to ${rupees(v)}`, `Currently ${rupees((c as any)[col])}`, v, { field, value: v });
        requested.push(label);
      } else run(`UPDATE cards SET ${col} = ? WHERE user_id = ?`, v, u.id);
    }
  });
  res.json({ ...cardPayload(u), requested, badges: evaluateBadges(u.id) });
});

teen.post('/card/reveal', (req, res) => {
  const b = z.object({ pin }).parse(req.body);
  const u = req.user!;
  verifyPin(u, b.pin);
  const c = getCard(u.id);
  res.json({ ...cardsProvider.revealCredentials(c.last4), expiry: c.expiry, note: 'Demo credentials. This is not a real card number.' });
});

// ---------- vaults ----------
const vaultDetail = (u: User, id: string) => {
  const v = get<any>('SELECT * FROM vaults WHERE id = ? AND user_id = ?', id, u.id);
  if (!v) throw new HttpError(404, 'NOT_FOUND', 'Vault not found.');
  const entries = all<any>('SELECT id, amount, created_at FROM vault_entries WHERE vault_id = ? ORDER BY created_at DESC LIMIT 100', id);
  return { vault: vaultView(v), entries: entries.map((e) => ({ id: e.id, amount: e.amount, createdAt: e.created_at })), balance: balanceOf(u.id) };
};
const vaultBody = z.object({
  name: z.string().trim().min(2, 'Give your goal a name.').max(40), emoji: z.string().min(1).max(8), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  target: amount(100_000_000).min(10000, 'Target must be at least ₹100.'), targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

teen.get('/vaults', (req, res) => {
  const u = req.user!;
  const vaults = all<any>('SELECT * FROM vaults WHERE user_id = ? ORDER BY completed_at IS NOT NULL, created_at', u.id);
  res.json({ vaults: vaults.map(vaultView), balance: balanceOf(u.id), monthSaved: Math.max(0, sumSaved(u.id, startOfMonth(now()))), savingsTarget: u.savings_target, suggestion: savingsSuggestion(u) });
});
teen.post('/vaults', (req, res) => {
  const b = vaultBody.parse(req.body);
  const u = req.user!;
  if (get<{ n: number }>('SELECT COUNT(*) n FROM vaults WHERE user_id = ?', u.id)!.n >= 12) throw bad('TOO_MANY', 'You can have up to 12 vaults.');
  const id = uid();
  run('INSERT INTO vaults (id,user_id,name,emoji,color,target,target_date,created_at) VALUES (?,?,?,?,?,?,?,?)', id, u.id, b.name, b.emoji, b.color, b.target, b.targetDate ?? null, now());
  res.status(201).json(vaultDetail(u, id));
});
teen.get('/vaults/:id', (req, res) => res.json(vaultDetail(req.user!, req.params.id)));
teen.patch('/vaults/:id', (req, res) => {
  const b = vaultBody.partial().parse(req.body);
  const u = req.user!, v = vaultDetail(u, req.params.id).vault;
  const target = b.target ?? v.target;
  run('UPDATE vaults SET name = ?, emoji = ?, color = ?, target = ?, target_date = ?, completed_at = ? WHERE id = ?',
    b.name ?? v.name, b.emoji ?? v.emoji, b.color ?? v.color, target, b.targetDate === undefined ? v.targetDate : b.targetDate,
    v.saved >= target ? v.completedAt ?? now() : null, v.id);
  res.json(vaultDetail(u, v.id));
});
teen.delete('/vaults/:id', (req, res) => {
  const u = req.user!, v = vaultDetail(u, req.params.id).vault;
  tx(() => {
    if (v.saved > 0) vaultMove(u, v.id, -v.saved);
    run('DELETE FROM vaults WHERE id = ?', v.id);
  });
  res.json({ returned: v.saved });
});
teen.post('/vaults/:id/:action', (req, res) => {
  const action = z.enum(['deposit', 'withdraw']).parse(req.params.action);
  const b = z.object({ amount: amount() }).parse(req.body);
  const u = req.user!;
  const before = vaultDetail(u, req.params.id).vault;
  vaultMove(u, before.id, action === 'deposit' ? b.amount : -b.amount);
  let reward = null;
  if (action === 'deposit') {
    // Small XP for the habit, capped at three rewarded deposits a day so it can't be farmed.
    const today = get<{ n: number }>(`SELECT COUNT(*) n FROM xp_events WHERE user_id = ? AND reason = 'Vault deposit' AND created_at >= ?`, u.id, now() - 24 * 3600 * 1000)!.n;
    if (b.amount >= 10000 && today < 3) reward = award(u.id, 15, 5, 'Vault deposit');
    const after = vaultDetail(u, before.id).vault;
    if (!before.completedAt && after.completedAt) reward = award(u.id, 100, 50, `Goal complete: ${after.name}`);
  }
  res.json({ ...vaultDetail(u, before.id), reward, justCompleted: !before.completedAt && !!vaultDetail(u, before.id).vault.completedAt, ...fresh(u) });
});

// ---------- rewards ----------
teen.get('/rewards', (req, res) => {
  const u = req.user!;
  const owned = new Set(all<{ reward: string }>('SELECT reward FROM redemptions WHERE user_id = ?', u.id).map((r) => r.reward));
  res.json({
    level: levelInfo(u.xp), coins: u.coins, streak: currentStreak(u), checkedInToday: u.streak_day === istDay(now()),
    week: Array.from({ length: 7 }, (_, i) => {
      const day = istDay(startOfWeek(now()) + i * 86400000);
      return { label: 'MTWTFSS'[i], day, done: !!get('SELECT 1 FROM checkins WHERE user_id = ? AND day = ?', u.id, day), today: day === istDay(now()) };
    }),
    missions: missionsFor(u), badges: badgesFor(u.id), leaderboard: leaderboard(u),
    store: REWARDS.map((r) => ({ ...r, owned: r.kind === 'skin' && owned.has(r.key) })),
    redemptions: all<any>('SELECT * FROM redemptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', u.id)
      .map((r) => ({ id: r.id, name: REWARDS.find((x) => x.key === r.reward)?.name ?? r.reward, emoji: REWARDS.find((x) => x.key === r.reward)?.emoji ?? '🎁', cost: r.cost, code: r.code, createdAt: r.created_at })),
    activity: all<any>('SELECT xp, coins, reason, created_at FROM xp_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 12', u.id)
      .map((e) => ({ xp: e.xp, coins: e.coins, reason: e.reason, createdAt: e.created_at })),
  });
});
teen.post('/rewards/checkin', (req, res) => res.json({ ...checkIn(req.user!), user: publicUser(getUser(req.user!.id)!) }));
teen.post('/rewards/missions/:key/claim', (req, res) => res.json({ ...claimMission(req.user!, req.params.key), user: publicUser(getUser(req.user!.id)!) }));
teen.post('/rewards/redeem', (req, res) => {
  const b = z.object({ key: z.string() }).parse(req.body);
  res.json({ ...redeem(req.user!, b.key), user: publicUser(getUser(req.user!.id)!) });
});

// ---------- financial intelligence ----------
teen.get('/insights', (req, res) => {
  const u = req.user!, t = now(), m0 = startOfMonth(t);
  const passed = new Set(all<{ quiz: string }>('SELECT DISTINCT quiz FROM quiz_attempts WHERE user_id = ? AND passed = 1', u.id).map((q) => q.quiz));
  res.json({
    categories: categoryBreakdown(u.id, m0), trend: monthlyTrend(u.id, 6), insights: buildInsights(u), suggestion: savingsSuggestion(u),
    health: healthScore(u), budget: u.monthly_budget, savingsTarget: u.savings_target, monthSpent: sumSpend(u.id, m0),
    quizzes: QUIZZES.map((q) => ({ key: q.key, title: q.title, emoji: q.emoji, minutes: q.minutes, xp: q.xp, passed: passed.has(q.key),
      questions: q.questions.map((x) => ({ q: x.q, options: x.options })) })),
  });
});
teen.get('/report', (req, res) => {
  const q = z.object({ offset: z.coerce.number().int().min(-11).max(0).default(0) }).parse(req.query);
  res.json(monthlyReport(req.user!, q.offset));
});
teen.post('/assistant/ask', (req, res) => {
  const b = z.object({ question: z.string().trim().min(1).max(200) }).parse(req.body);
  res.json(ask(req.user!, b.question));
});
teen.post('/quiz/:key', (req, res) => {
  const quiz = QUIZZES.find((q) => q.key === req.params.key);
  if (!quiz) throw new HttpError(404, 'NOT_FOUND', 'Quiz not found.');
  const b = z.object({ answers: z.array(z.number().int().min(0).max(3)).length(quiz.questions.length) }).parse(req.body);
  const u = req.user!;
  const results = quiz.questions.map((q, i) => ({ correct: q.answer === b.answers[i], answer: q.answer, why: q.why }));
  const score = results.filter((r) => r.correct).length, passed = score >= quiz.questions.length - 1;
  const first = passed && !get('SELECT 1 FROM quiz_attempts WHERE user_id = ? AND quiz = ? AND passed = 1', u.id, quiz.key);
  run('INSERT INTO quiz_attempts (user_id,quiz,score,passed,created_at) VALUES (?,?,?,?,?)', u.id, quiz.key, score, passed ? 1 : 0, now());
  const reward = first ? award(u.id, quiz.xp, 20, `Quiz: ${quiz.title}`) : null;
  res.json({ score, total: quiz.questions.length, passed, results, reward, ...fresh(u) });
});

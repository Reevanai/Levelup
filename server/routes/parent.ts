import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, tx } from '../db.ts';
import { HttpError, bad, now, rupees, startOfMonth, startOfWeek, DAY } from '../lib.ts';
import { requireRole } from '../http.ts';
import {
  balanceOf, categoryBreakdown, getCard, getUser, nextAllowanceRun, notify, postTxn, publicCard, publicTxn, resolveApproval,
  sumIncome, sumSaved, sumSpend, type Txn, type User,
} from '../services.ts';
import { funding } from '../providers.ts';
import { currentStreak } from '../game.ts';
import { dailySpend, healthScore } from '../insights.ts';
import { CATEGORY_KEYS, levelInfo } from '../../shared/constants.ts';

export const parent = Router();
parent.use(requireRole('parent'));

/** Every child route goes through this, so a parent can only ever touch their own linked children. */
function childOf(p: User, childId: string) {
  const c = get<User>(`SELECT * FROM users WHERE id = ? AND parent_id = ? AND role = 'teen'`, childId, p.id);
  if (!c) throw new HttpError(404, 'NOT_FOUND', 'Child account not found.');
  return c;
}

const approvalView = (a: any) => ({ id: a.id, childId: a.child_id, type: a.type, title: a.title, detail: a.detail, amount: a.amount, status: a.status, createdAt: a.created_at, resolvedAt: a.resolved_at });

parent.get('/overview', (req, res) => {
  const p = req.user!, t = now(), m0 = startOfMonth(t);
  const children = all<User>(`SELECT * FROM users WHERE parent_id = ? AND role = 'teen' ORDER BY created_at`, p.id).map((c) => {
    const allowance = get<any>('SELECT * FROM allowances WHERE child_id = ?', c.id);
    const vaults = all<any>('SELECT * FROM vaults WHERE user_id = ? ORDER BY created_at', c.id);
    return {
      id: c.id, name: c.name, avatar: c.avatar, handle: c.handle, kycStatus: c.kyc_status, level: levelInfo(c.xp), streak: currentStreak(c),
      balance: balanceOf(c.id), monthSpent: sumSpend(c.id, m0), monthReceived: sumIncome(c.id, m0), monthSaved: Math.max(0, sumSaved(c.id, m0)),
      weekSpent: sumSpend(c.id, startOfWeek(t)), budget: c.monthly_budget, categories: categoryBreakdown(c.id, m0), daily: dailySpend(c.id, 7),
      health: healthScore(c), card: publicCard(getCard(c.id), c.id),
      vaults: vaults.map((v) => ({ id: v.id, name: v.name, emoji: v.emoji, color: v.color, target: v.target, saved: v.saved, targetDate: v.target_date, completedAt: v.completed_at })),
      recent: all<Txn>(`SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`, c.id).map(publicTxn),
      allowance: allowance ? { amount: allowance.amount, frequency: allowance.frequency, active: !!allowance.active, nextRun: allowance.next_run } : null,
    };
  });
  res.json({
    children,
    pending: all<any>(`SELECT * FROM approvals WHERE parent_id = ? AND status = 'pending' ORDER BY created_at DESC`, p.id).map(approvalView),
    history: all<any>(`SELECT * FROM approvals WHERE parent_id = ? AND status != 'pending' ORDER BY resolved_at DESC LIMIT 10`, p.id).map(approvalView),
  });
});

parent.post('/children/link', (req, res) => {
  const b = z.object({ familyCode: z.string().trim().toUpperCase().min(4).max(12) }).parse(req.body);
  const p = req.user!;
  const child = get<User>(`SELECT * FROM users WHERE family_code = ? AND role = 'teen'`, b.familyCode);
  if (!child) throw bad('BAD_FAMILY_CODE', "We couldn't find that family code.");
  if (child.parent_id) throw bad('ALREADY_LINKED', child.parent_id === p.id ? 'This child is already linked to you.' : 'That account is already linked to a parent.');
  run('UPDATE users SET parent_id = ? WHERE id = ?', p.id, child.id);
  notify(child.id, 'system', `${p.name} linked as your parent`, 'They can now send allowance and help with limits.', '/app/profile');
  res.status(201).json({ childId: child.id, name: child.name });
});

parent.put('/children/:id/allowance', (req, res) => {
  const b = z.object({ amount: z.number().int().min(10000, 'Minimum allowance is ₹100.').max(2_000_000, 'Maximum allowance is ₹20,000.'), frequency: z.enum(['weekly', 'monthly']), active: z.boolean() }).parse(req.body);
  const p = req.user!, c = childOf(p, req.params.id);
  const existing = get<any>('SELECT * FROM allowances WHERE child_id = ?', c.id);
  const nextRun = existing && existing.frequency === b.frequency && existing.next_run > now() ? existing.next_run : nextAllowanceRun(b.frequency, now());
  run(`INSERT INTO allowances (child_id,parent_id,amount,frequency,active,next_run) VALUES (?,?,?,?,?,?)
       ON CONFLICT(child_id) DO UPDATE SET amount = excluded.amount, frequency = excluded.frequency, active = excluded.active, next_run = excluded.next_run, parent_id = excluded.parent_id`,
    c.id, p.id, b.amount, b.frequency, b.active ? 1 : 0, nextRun);
  notify(c.id, 'system', b.active ? `Allowance set: ${rupees(b.amount)} ${b.frequency}` : 'Allowance paused', b.active ? 'It will land in your wallet automatically.' : 'Your parent paused your scheduled allowance.', '/app/wallet');
  res.json({ allowance: { amount: b.amount, frequency: b.frequency, active: b.active, nextRun } });
});

parent.post('/children/:id/topup', (req, res) => {
  const b = z.object({ amount: z.number().int().positive().max(2_000_000, 'Maximum top-up is ₹20,000.'), note: z.string().trim().max(80).optional() }).parse(req.body);
  const p = req.user!, c = childOf(p, req.params.id);
  if (balanceOf(c.id) + b.amount > 10_000_000) throw bad('WALLET_CAP', 'That would take the wallet over the ₹1,00,000 demo cap.');
  const r = funding.collect(c.id, b.amount, 'parent');
  const t = postTxn({ userId: c.id, direction: 'credit', amount: b.amount, kind: 'topup', category: 'income', title: `From ${p.name}`, subtitle: 'Parent top-up', note: b.note, method: 'Parent top-up (simulated)', ref: r.ref });
  notify(c.id, 'txn', `${p.name.split(' ')[0]} sent you ${rupees(b.amount)}`, b.note ?? 'Parent top-up', `/app/txn/${t.id}`);
  res.json({ txn: publicTxn(t) });
});

parent.patch('/children/:id/controls', (req, res) => {
  const lim = z.number().int().min(10000, 'Minimum limit is ₹100.').max(5_000_000, 'Maximum limit is ₹50,000.').optional();
  const b = z.object({ parentLocked: z.boolean().optional(), perTxnLimit: lim, dailyLimit: lim, monthlyLimit: lim,
    blockedCategories: z.array(z.enum(CATEGORY_KEYS)).optional(), approvalThreshold: z.number().int().min(0).max(5_000_000).optional() }).parse(req.body);
  const p = req.user!, c = childOf(p, req.params.id), card = getCard(c.id);
  tx(() => {
    run(`UPDATE cards SET parent_locked = ?, per_txn_limit = ?, daily_limit = ?, monthly_limit = ?, blocked_categories = ?, approval_threshold = ? WHERE user_id = ?`,
      b.parentLocked === undefined ? card.parent_locked : b.parentLocked ? 1 : 0, b.perTxnLimit ?? card.per_txn_limit, b.dailyLimit ?? card.daily_limit,
      b.monthlyLimit ?? card.monthly_limit, b.blockedCategories ? JSON.stringify(b.blockedCategories) : card.blocked_categories, b.approvalThreshold ?? card.approval_threshold, c.id);
    if (b.parentLocked !== undefined && !!card.parent_locked !== b.parentLocked) {
      notify(c.id, 'security', b.parentLocked ? 'Your parent locked your card 🔒' : 'Your parent unlocked your card', b.parentLocked ? 'Payments are paused until they unlock it.' : 'You can pay again.', '/app/cards');
    } else notify(c.id, 'system', 'Your parent updated your spending controls', 'Check Cards to see your current limits.', '/app/cards');
  });
  res.json({ card: publicCard(getCard(c.id), c.id) });
});

parent.post('/approvals/:id', (req, res) => {
  const b = z.object({ decision: z.enum(['approve', 'decline']) }).parse(req.body);
  res.json(resolveApproval(req.user!, req.params.id, b.decision === 'approve'));
});

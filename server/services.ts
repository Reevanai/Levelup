import { all, get, run, tx } from './db.ts';
import { HttpError, bad, now, uid, startOfDay, startOfMonth, DAY, addMonths, rupees } from './lib.ts';
import { cardsProvider, funding, internalRef } from './providers.ts';
import { CATEGORIES } from '../shared/constants.ts';

export interface User {
  id: string; role: 'teen' | 'parent'; name: string; email: string; handle: string;
  password_hash: string; pin_hash: string | null; pin_fails: number; pin_locked_until: number;
  dob: string | null; avatar: string; parent_id: string | null; family_code: string | null;
  kyc_status: string; onboarded: number; is_demo: number; xp: number; coins: number;
  streak: number; streak_day: string | null; monthly_budget: number; savings_target: number;
  settings: string; created_at: number;
}
export interface Txn {
  id: string; user_id: string; direction: 'credit' | 'debit'; amount: number; kind: string;
  category: string; title: string; subtitle: string | null; note: string | null; status: string;
  method: string; provider_ref: string; balance_after: number; vault_id: string | null; created_at: number;
}
export interface Card {
  user_id: string; design: string; last4: string; expiry: string; frozen: number; parent_locked: number;
  online_enabled: number; instore_enabled: number; international_enabled: number; notify_txn: number;
  per_txn_limit: number; daily_limit: number; monthly_limit: number; blocked_categories: string;
  approval_threshold: number;
}

export const getUser = (id: string) => get<User>('SELECT * FROM users WHERE id = ?', id);
export const balanceOf = (userId: string) => get<{ balance: number }>('SELECT balance FROM wallets WHERE user_id = ?', userId)?.balance ?? 0;
export const getCard = (userId: string) => get<Card>('SELECT * FROM cards WHERE user_id = ?', userId)!;
export const catLabel = (key: string) => CATEGORIES.find((c) => c.key === key)?.label ?? key;

export function notify(userId: string, type: string, title: string, body: string, link?: string, at = now()) {
  run('INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)',
    uid(), userId, type, title, body, link ?? null, at);
}

/** The single write path for the simulation ledger. */
export function postTxn(o: {
  userId: string; direction: 'credit' | 'debit'; amount: number; kind: string; category: string;
  title: string; subtitle?: string; note?: string; method: string; ref?: string; vaultId?: string;
  status?: string; at?: number;
}): Txn {
  return tx(() => {
    if (!Number.isInteger(o.amount) || o.amount <= 0) throw bad('INVALID_AMOUNT', 'Enter a valid amount.');
    const bal = balanceOf(o.userId);
    const next = o.direction === 'credit' ? bal + o.amount : bal - o.amount;
    if (next < 0) throw bad('INSUFFICIENT_FUNDS', `You only have ${rupees(bal)} in your wallet.`);
    run('UPDATE wallets SET balance = ? WHERE user_id = ?', next, o.userId);
    const id = uid();
    run(`INSERT INTO transactions (id,user_id,direction,amount,kind,category,title,subtitle,note,status,method,provider_ref,balance_after,vault_id,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, o.userId, o.direction, o.amount, o.kind, o.category, o.title, o.subtitle ?? null, o.note ?? null,
      o.status ?? 'success', o.method, o.ref ?? internalRef(), next, o.vaultId ?? null, o.at ?? now());
    return get<Txn>('SELECT * FROM transactions WHERE id = ?', id)!;
  });
}

/** Record a declined attempt without touching the balance. */
export function postDeclined(userId: string, amount: number, category: string, title: string, reason: string) {
  const id = uid();
  run(`INSERT INTO transactions (id,user_id,direction,amount,kind,category,title,subtitle,note,status,method,provider_ref,balance_after,created_at)
       VALUES (?,?,'debit',?,'card',?,?,?,?,'declined','LevelUp Card (simulated)',?,?,?)`,
    id, userId, amount, category, title, 'Declined', reason, internalRef(), balanceOf(userId), now());
  return id;
}

// ---------- spending maths ----------
export const SPEND = `direction = 'debit' AND status = 'success' AND kind IN ('card','transfer')`;
export const INCOME = `direction = 'credit' AND status = 'success' AND kind NOT IN ('vault')`;

export const sumSpend = (userId: string, from: number, to = now() + 1) =>
  get<{ s: number }>(`SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND ${SPEND} AND created_at >= ? AND created_at < ?`, userId, from, to)!.s;
export const sumIncome = (userId: string, from: number, to = now() + 1) =>
  get<{ s: number }>(`SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND ${INCOME} AND created_at >= ? AND created_at < ?`, userId, from, to)!.s;
export const sumSaved = (userId: string, from: number, to = now() + 1) =>
  get<{ s: number }>(`SELECT COALESCE(SUM(amount),0) s FROM vault_entries WHERE user_id = ? AND created_at >= ? AND created_at < ?`, userId, from, to)!.s;
const sumCard = (userId: string, from: number) =>
  get<{ s: number }>(`SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND kind = 'card' AND status = 'success' AND created_at >= ?`, userId, from)!.s;

export function categoryBreakdown(userId: string, from: number, to = now() + 1) {
  const rows = all<{ category: string; total: number; n: number }>(
    `SELECT category, SUM(amount) total, COUNT(*) n FROM transactions WHERE user_id = ? AND ${SPEND} AND created_at >= ? AND created_at < ? GROUP BY category`,
    userId, from, to);
  const by = new Map(rows.map((r) => [r.category, r]));
  // Fixed category order so chart colours never shift between views.
  return CATEGORIES.map((c) => ({ key: c.key, label: c.label, color: c.color, emoji: c.emoji, total: by.get(c.key)?.total ?? 0, count: by.get(c.key)?.n ?? 0 }));
}

// ---------- card ----------
export function cardUsage(userId: string) {
  const t = now();
  return { today: sumCard(userId, startOfDay(t)), month: sumCard(userId, startOfMonth(t)) };
}

export function publicCard(c: Card, userId: string) {
  return {
    design: c.design, last4: c.last4, expiry: c.expiry, masked: `•••• •••• •••• ${c.last4}`,
    frozen: !!c.frozen, parentLocked: !!c.parent_locked, onlineEnabled: !!c.online_enabled,
    instoreEnabled: !!c.instore_enabled, internationalEnabled: !!c.international_enabled,
    notifyTxn: !!c.notify_txn, perTxnLimit: c.per_txn_limit, dailyLimit: c.daily_limit,
    monthlyLimit: c.monthly_limit, blockedCategories: JSON.parse(c.blocked_categories) as string[],
    approvalThreshold: c.approval_threshold, usage: cardUsage(userId),
  };
}

export type SpendInput = { amount: number; merchant: string; category: string; channel: 'online' | 'instore'; note?: string };

/** Why a card payment can't go through right now, or null if it can. */
export function declineReason(user: User, s: SpendInput): string | null {
  const c = getCard(user.id);
  const use = cardUsage(user.id);
  if (c.parent_locked) return 'Your card is locked by your parent.';
  if (c.frozen) return 'Your card is frozen. Unfreeze it to pay.';
  if (s.channel === 'online' && !c.online_enabled) return 'Online payments are switched off for your card.';
  if (s.channel === 'instore' && !c.instore_enabled) return 'In-store payments are switched off for your card.';
  if ((JSON.parse(c.blocked_categories) as string[]).includes(s.category)) return `${catLabel(s.category)} is blocked by your parent.`;
  if (s.amount > c.per_txn_limit) return `This is over your per-payment limit of ${rupees(c.per_txn_limit)}.`;
  if (use.today + s.amount > c.daily_limit) return `This would cross your daily limit of ${rupees(c.daily_limit)}.`;
  if (use.month + s.amount > c.monthly_limit) return `This would cross your monthly limit of ${rupees(c.monthly_limit)}.`;
  if (s.amount > balanceOf(user.id)) return `You only have ${rupees(balanceOf(user.id))} in your wallet.`;
  return null;
}

export function executeCardSpend(user: User, s: SpendInput) {
  const auth = cardsProvider.authorize(user.id, s.amount, s.merchant);
  if (!auth.ok) throw bad('DECLINED', auth.reason ?? 'Payment declined.');
  const t = postTxn({
    userId: user.id, direction: 'debit', amount: s.amount, kind: 'card', category: s.category,
    title: s.merchant, subtitle: s.channel === 'online' ? 'Online payment' : 'In-store payment',
    note: s.note, method: 'LevelUp Card (simulated)', ref: auth.ref,
  });
  if (getCard(user.id).notify_txn) {
    notify(user.id, 'txn', `Paid ${rupees(s.amount)} at ${s.merchant}`, `Card •• ${getCard(user.id).last4} · balance ${rupees(t.balance_after)}`, `/app/txn/${t.id}`);
  }
  if (user.parent_id) {
    notify(user.parent_id, 'child_spend', `${user.name.split(' ')[0]} spent ${rupees(s.amount)}`, `${s.merchant} · ${catLabel(s.category)}`, '/parent');
  }
  return t;
}

// ---------- approvals ----------
export function createApproval(child: User, type: string, title: string, detail: string, amount: number, payload: object) {
  if (!child.parent_id) throw bad('NO_PARENT', 'Link a parent account first.');
  const id = uid();
  run('INSERT INTO approvals (id,child_id,parent_id,type,title,detail,amount,payload,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    id, child.id, child.parent_id, type, title, detail, amount, JSON.stringify(payload), now());
  notify(child.parent_id, 'approval', `${child.name.split(' ')[0]} needs your approval`, title, '/parent');
  return id;
}

export function resolveApproval(parent: User, approvalId: string, approve: boolean) {
  return tx(() => {
    const a = get<any>('SELECT * FROM approvals WHERE id = ? AND parent_id = ?', approvalId, parent.id);
    if (!a) throw new HttpError(404, 'NOT_FOUND', 'Approval not found.');
    if (a.status !== 'pending') throw bad('ALREADY_RESOLVED', 'This request was already handled.');
    const child = getUser(a.child_id)!;
    const payload = JSON.parse(a.payload);
    let outcome = approve ? 'approved' : 'declined';
    let message = '';
    if (approve) {
      if (a.type === 'money_request') {
        const f = funding.collect(child.id, a.amount, 'parent');
        postTxn({ userId: child.id, direction: 'credit', amount: a.amount, kind: 'topup', category: 'income',
          title: `From ${parent.name}`, subtitle: 'Request approved', note: payload.note, method: 'Parent top-up (simulated)', ref: f.ref });
        run(`UPDATE money_requests SET status = 'paid' WHERE approval_id = ?`, a.id);
        message = `${rupees(a.amount)} added to your wallet.`;
      } else if (a.type === 'purchase') {
        // Re-check every control except the approval threshold itself.
        const why = declineReason(child, payload);
        if (why) throw bad('CANNOT_APPROVE', `Can't complete this payment: ${why}`);
        executeCardSpend(child, payload);
        message = `Your ${rupees(a.amount)} payment at ${payload.merchant} went through.`;
      } else if (a.type === 'limit_increase') {
        const col = ({ perTxnLimit: 'per_txn_limit', dailyLimit: 'daily_limit', monthlyLimit: 'monthly_limit' } as Record<string, string>)[payload.field];
        if (!col) throw bad('BAD_PAYLOAD', 'Unknown limit.');
        run(`UPDATE cards SET ${col} = ? WHERE user_id = ?`, payload.value, child.id);
        message = `Your new limit is ${rupees(payload.value)}.`;
      }
    } else {
      if (a.type === 'money_request') run(`UPDATE money_requests SET status = 'declined' WHERE approval_id = ?`, a.id);
      message = 'Your parent declined this one.';
    }
    run('UPDATE approvals SET status = ?, resolved_at = ? WHERE id = ?', outcome, now(), a.id);
    notify(child.id, 'approval', `${a.title} — ${outcome}`, message, a.type === 'limit_increase' ? '/app/cards' : '/app/wallet');
    return { status: outcome };
  });
}

// ---------- allowances ----------
export function nextAllowanceRun(frequency: string, from: number) {
  return frequency === 'weekly' ? from + 7 * DAY : addMonths(startOfMonth(from), 1) + (from - startOfMonth(from));
}

export function processAllowances() {
  const due = all<any>('SELECT * FROM allowances WHERE active = 1 AND next_run <= ?', now());
  for (const a of due) {
    tx(() => {
      const parent = getUser(a.parent_id);
      let next = a.next_run;
      let guard = 0;
      while (next <= now() && guard++ < 60) {
        postTxn({ userId: a.child_id, direction: 'credit', amount: a.amount, kind: 'allowance', category: 'income',
          title: 'Allowance', subtitle: `From ${parent?.name ?? 'parent'}`, method: 'Scheduled allowance (simulated)', at: next });
        next = nextAllowanceRun(a.frequency, next);
      }
      run('UPDATE allowances SET next_run = ? WHERE child_id = ?', next, a.child_id);
      notify(a.child_id, 'txn', `Allowance received: ${rupees(a.amount)}`, 'Fresh funds. Stash a slice in a vault?', '/app/vaults');
    });
  }
}

// ---------- vaults ----------
export function vaultMove(user: User, vaultId: string, amount: number) {
  return tx(() => {
    const v = get<any>('SELECT * FROM vaults WHERE id = ? AND user_id = ?', vaultId, user.id);
    if (!v) throw new HttpError(404, 'NOT_FOUND', 'Vault not found.');
    if (amount < 0 && -amount > v.saved) throw bad('INSUFFICIENT_VAULT', `This vault only holds ${rupees(v.saved)}.`);
    postTxn({
      userId: user.id, direction: amount > 0 ? 'debit' : 'credit', amount: Math.abs(amount), kind: 'vault',
      category: 'savings', title: amount > 0 ? `Saved to ${v.name}` : `Withdrew from ${v.name}`,
      subtitle: 'Savings vault', method: 'Wallet transfer (simulated)', vaultId,
    });
    const saved = v.saved + amount;
    const completed = v.completed_at ?? (saved >= v.target ? now() : null);
    run('UPDATE vaults SET saved = ?, completed_at = ? WHERE id = ?', saved, completed, vaultId);
    run('INSERT INTO vault_entries (id,vault_id,user_id,amount,created_at) VALUES (?,?,?,?,?)', uid(), vaultId, user.id, amount, now());
    if (!v.completed_at && completed) notify(user.id, 'reward', `Goal smashed: ${v.name} 🎉`, `You saved the full ${rupees(v.target)}.`, `/app/vaults/${vaultId}`);
    if (user.parent_id && amount > 0) notify(user.parent_id, 'child_save', `${user.name.split(' ')[0]} saved ${rupees(amount)}`, `Into "${v.name}"`, '/parent');
    return get<any>('SELECT * FROM vaults WHERE id = ?', vaultId);
  });
}

export const publicTxn = (t: Txn) => ({
  id: t.id, direction: t.direction, amount: t.amount, kind: t.kind, category: t.category, title: t.title,
  subtitle: t.subtitle, note: t.note, status: t.status, method: t.method, ref: t.provider_ref,
  balanceAfter: t.balance_after, vaultId: t.vault_id, createdAt: t.created_at,
});

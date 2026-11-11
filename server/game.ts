import { all, get, run, tx } from './db.ts';
import { DAY, bad, istDay, monthKey, now, shortCode, startOfMonth, startOfWeek, uid, weekKey, rupees } from './lib.ts';
import { getUser, notify, postTxn, sumSaved, sumSpend, type User } from './services.ts';
import { levelInfo } from '../shared/constants.ts';

// ---------- XP ----------
export function award(userId: string, xp: number, coins: number, reason: string, at = now()) {
  return tx(() => {
    const before = getUser(userId)!;
    run('UPDATE users SET xp = xp + ?, coins = coins + ? WHERE id = ?', xp, coins, userId);
    run('INSERT INTO xp_events (id,user_id,xp,coins,reason,created_at) VALUES (?,?,?,?,?,?)', uid(), userId, xp, coins, reason, at);
    const a = levelInfo(before.xp), b = levelInfo(before.xp + xp);
    if (b.level > a.level) notify(userId, 'reward', `Level ${b.level} unlocked: ${b.title} ⚡`, 'New level, new bragging rights.', '/app/rewards');
    return { xp, coins, leveledUp: b.level > a.level, level: b.level, title: b.title };
  });
}

// ---------- streak ----------
export function currentStreak(u: User) {
  const today = istDay(now()), yesterday = istDay(now() - DAY);
  return u.streak_day === today || u.streak_day === yesterday ? u.streak : 0;
}

export function checkIn(u: User) {
  const today = istDay(now());
  if (u.streak_day === today) throw bad('ALREADY_CHECKED_IN', "You've already checked in today.");
  return tx(() => {
    const streak = u.streak_day === istDay(now() - DAY) ? u.streak + 1 : 1;
    run('UPDATE users SET streak = ?, streak_day = ? WHERE id = ?', streak, today, u.id);
    run('INSERT OR IGNORE INTO checkins (user_id, day) VALUES (?,?)', u.id, today);
    const bonus = streak % 7 === 0 ? 50 : 0;
    const reward = award(u.id, 20 + bonus, 10 + bonus / 2, bonus ? `${streak}-day streak bonus` : 'Daily expense check-in');
    const badges = evaluateBadges(u.id);
    return { streak, reward, badges };
  });
}

// ---------- missions ----------
type Group = 'weekly' | 'monthly' | 'challenge';
interface MissionDef {
  key: string; group: Group; title: string; desc: string; xp: number; coins: number; unit: 'money' | 'count';
  measure(u: User, t: number): { current: number; target: number; lockedUntilEnd?: boolean; failed?: boolean };
}
const count = (sql: string, ...p: (string | number)[]) => get<{ n: number }>(sql, ...p)!.n;

const MISSIONS: MissionDef[] = [
  { key: 'save_500', group: 'weekly', title: 'Save ₹500 this week', desc: 'Move ₹500 or more into any vault.', xp: 120, coins: 60, unit: 'money',
    measure: (u, t) => ({ current: Math.max(0, sumSaved(u.id, startOfWeek(t))), target: 50000 }) },
  { key: 'within_limit', group: 'weekly', title: 'Stay within your spending limit', desc: 'Keep this week under a quarter of your monthly budget. Unlocks on Sunday.', xp: 150, coins: 75, unit: 'money',
    measure: (u, t) => {
      const limit = Math.round(u.monthly_budget / 4), spent = sumSpend(u.id, startOfWeek(t));
      const sunday = t >= startOfWeek(t) + 6 * DAY;
      return { current: spent, target: limit, lockedUntilEnd: !sunday, failed: spent > limit };
    } },
  { key: 'track_5', group: 'weekly', title: 'Track expenses for 5 days', desc: 'Do your daily check-in on five days this week.', xp: 100, coins: 50, unit: 'count',
    measure: (u, t) => ({ current: count('SELECT COUNT(*) n FROM checkins WHERE user_id = ? AND day >= ?', u.id, weekKey(t)), target: 5 }) },
  { key: 'quiz_1', group: 'weekly', title: 'Ace a money quiz', desc: 'Pass any financial literacy quiz this week.', xp: 60, coins: 30, unit: 'count',
    measure: (u, t) => ({ current: count('SELECT COUNT(*) n FROM quiz_attempts WHERE user_id = ? AND passed = 1 AND created_at >= ?', u.id, startOfWeek(t)), target: 1 }) },
  { key: 'monthly_target', group: 'monthly', title: 'Reach your monthly savings target', desc: 'Hit the savings target you set in your profile.', xp: 300, coins: 150, unit: 'money',
    measure: (u, t) => ({ current: Math.max(0, sumSaved(u.id, startOfMonth(t))), target: Math.max(u.savings_target, 100) }) },
  { key: 'vault_boost', group: 'challenge', title: 'Triple deposit', desc: 'Add to your vaults three separate times this week.', xp: 80, coins: 40, unit: 'count',
    measure: (u, t) => ({ current: count('SELECT COUNT(*) n FROM vault_entries WHERE user_id = ? AND amount > 0 AND created_at >= ?', u.id, startOfWeek(t)), target: 3 }) },
  { key: 'streak_7', group: 'challenge', title: '7-day streak', desc: 'Check in seven days in a row.', xp: 100, coins: 50, unit: 'count',
    measure: (u) => ({ current: Math.min(currentStreak(u), 7), target: 7 }) },
  { key: 'finish_vault', group: 'challenge', title: 'Finish a savings goal', desc: 'Fill any vault all the way to its target.', xp: 250, coins: 125, unit: 'count',
    measure: (u) => ({ current: count('SELECT COUNT(*) n FROM vaults WHERE user_id = ? AND completed_at IS NOT NULL', u.id), target: 1 }) },
];

const periodOf = (m: MissionDef, t: number) => (m.group === 'monthly' ? monthKey(t) : m.key === 'streak_7' || m.key === 'finish_vault' ? 'once' : weekKey(t));
const endsAt = (m: MissionDef, t: number) => (m.group === 'monthly' ? startOfMonth(t) + 32 * DAY : periodOf(m, t) === 'once' ? null : startOfWeek(t) + 7 * DAY);

export function missionsFor(u: User) {
  const t = now();
  return MISSIONS.map((m) => {
    const r = m.measure(u, t);
    const claimed = !!get('SELECT 1 FROM mission_claims WHERE user_id = ? AND mission = ? AND period = ?', u.id, m.key, periodOf(m, t));
    const inverse = m.key === 'within_limit';
    const met = inverse ? !r.failed && !r.lockedUntilEnd : r.current >= r.target;
    const status = claimed ? 'claimed' : r.failed ? 'failed' : met ? 'claimable' : 'in_progress';
    const end = m.group === 'monthly' ? startOfMonth(startOfMonth(t) + 32 * DAY) : endsAt(m, t);
    return { key: m.key, group: m.group, title: m.title, desc: m.desc, xp: m.xp, coins: m.coins, unit: m.unit,
      current: r.current, target: r.target, inverse, progress: Math.min(1, r.current / r.target), status, endsAt: end };
  });
}

export function claimMission(u: User, key: string) {
  const m = missionsFor(u).find((x) => x.key === key);
  if (!m) throw bad('UNKNOWN_MISSION', 'Mission not found.');
  if (m.status === 'claimed') throw bad('ALREADY_CLAIMED', 'You already claimed this reward.');
  if (m.status !== 'claimable') throw bad('NOT_READY', "This mission isn't complete yet.");
  return tx(() => {
    const def = MISSIONS.find((x) => x.key === key)!;
    run('INSERT INTO mission_claims (user_id,mission,period,claimed_at) VALUES (?,?,?,?)', u.id, key, periodOf(def, now()), now());
    const reward = award(u.id, m.xp, m.coins, `Mission: ${m.title}`);
    return { reward, badges: evaluateBadges(u.id) };
  });
}

// ---------- badges ----------
export const BADGES: { key: string; name: string; desc: string; emoji: string; test: (u: User) => boolean }[] = [
  { key: 'first_save', name: 'First Stash', desc: 'Made your first vault deposit', emoji: '🌱', test: (u) => count('SELECT COUNT(*) n FROM vault_entries WHERE user_id = ? AND amount > 0', u.id) > 0 },
  { key: 'saver_5k', name: 'Five-K Club', desc: 'Saved ₹5,000 across vaults', emoji: '💎', test: (u) => count('SELECT COALESCE(SUM(saved),0) n FROM vaults WHERE user_id = ?', u.id) >= 500000 },
  { key: 'saver_25k', name: 'Quarter Lakh', desc: 'Saved ₹25,000 across vaults', emoji: '🏦', test: (u) => count('SELECT COALESCE(SUM(saved),0) n FROM vaults WHERE user_id = ?', u.id) >= 2500000 },
  { key: 'goal_getter', name: 'Goal Getter', desc: 'Completed a savings vault', emoji: '🎯', test: (u) => count('SELECT COUNT(*) n FROM vaults WHERE user_id = ? AND completed_at IS NOT NULL', u.id) > 0 },
  { key: 'streak_3', name: 'Warming Up', desc: '3-day check-in streak', emoji: '🔥', test: (u) => u.streak >= 3 },
  { key: 'streak_7', name: 'Week Warrior', desc: '7-day check-in streak', emoji: '⚔️', test: (u) => u.streak >= 7 },
  { key: 'streak_30', name: 'Unbreakable', desc: '30-day check-in streak', emoji: '🛡️', test: (u) => u.streak >= 30 },
  { key: 'budget_boss', name: 'Budget Boss', desc: 'Finished a week under your limit', emoji: '👑', test: (u) => count(`SELECT COUNT(*) n FROM mission_claims WHERE user_id = ? AND mission = 'within_limit'`, u.id) > 0 },
  { key: 'quiz_whiz', name: 'Quiz Whiz', desc: 'Passed 3 money quizzes', emoji: '🧠', test: (u) => count('SELECT COUNT(DISTINCT quiz) n FROM quiz_attempts WHERE user_id = ? AND passed = 1', u.id) >= 3 },
  { key: 'first_send', name: 'Squad Pay', desc: 'Sent money to a friend', emoji: '🤝', test: (u) => count(`SELECT COUNT(*) n FROM transactions WHERE user_id = ? AND kind = 'transfer' AND direction = 'debit'`, u.id) > 0 },
  { key: 'card_stylist', name: 'Card Stylist', desc: 'Customised your card design', emoji: '🎨', test: (u) => count(`SELECT COUNT(*) n FROM cards WHERE user_id = ? AND design != 'nebula'`, u.id) > 0 },
  { key: 'level_5', name: 'High Five', desc: 'Reached level 5', emoji: '🚀', test: (u) => levelInfo(u.xp).level >= 5 },
];

/** Grant any newly-earned badges; returns the new ones. */
export function evaluateBadges(userId: string, at = now(), silent = false) {
  const u = getUser(userId)!;
  const have = new Set(all<{ badge: string }>('SELECT badge FROM badges WHERE user_id = ?', userId).map((b) => b.badge));
  const fresh = BADGES.filter((b) => !have.has(b.key) && b.test(u));
  for (const b of fresh) {
    run('INSERT INTO badges (user_id,badge,earned_at) VALUES (?,?,?)', userId, b.key, at);
    if (!silent) notify(userId, 'reward', `Badge unlocked: ${b.name} ${b.emoji}`, b.desc, '/app/rewards');
  }
  return fresh.map(({ key, name, desc, emoji }) => ({ key, name, desc, emoji }));
}

export function badgesFor(userId: string) {
  const earned = new Map(all<{ badge: string; earned_at: number }>('SELECT badge, earned_at FROM badges WHERE user_id = ?', userId).map((b) => [b.badge, b.earned_at]));
  return BADGES.map(({ key, name, desc, emoji }) => ({ key, name, desc, emoji, earnedAt: earned.get(key) ?? null }));
}

// ---------- leaderboard (demo league: the other players are scripted) ----------
const PEERS = [
  { name: 'Ishaan K.', avatar: '🐯', week: 520, total: 4120 }, { name: 'Meera S.', avatar: '🦋', week: 470, total: 3650 },
  { name: 'Kabir R.', avatar: '🐺', week: 395, total: 2980 }, { name: 'Ananya P.', avatar: '🦄', week: 340, total: 2710 },
  { name: 'Rohan D.', avatar: '🦅', week: 290, total: 2240 }, { name: 'Zoya M.', avatar: '🐼', week: 215, total: 1890 },
  { name: 'Dev T.', avatar: '🐙', week: 160, total: 1320 }, { name: 'Tara N.', avatar: '🦉', week: 95, total: 870 },
];
export function leaderboard(u: User) {
  const week = get<{ s: number }>('SELECT COALESCE(SUM(xp),0) s FROM xp_events WHERE user_id = ? AND created_at >= ?', u.id, startOfWeek(now()))!.s;
  const build = (field: 'week' | 'total', mine: number) =>
    [...PEERS.map((p) => ({ name: p.name, avatar: p.avatar, xp: p[field], you: false })), { name: u.name, avatar: u.avatar, xp: mine, you: true }]
      .sort((a, b) => b.xp - a.xp).map((r, i) => ({ ...r, rank: i + 1 }));
  return { week: build('week', week), allTime: build('total', u.xp) };
}

// ---------- reward store ----------
export const REWARDS = [
  { key: 'wallet_50', name: '₹50 wallet boost', desc: 'Simulated credit added to your demo wallet.', cost: 250, emoji: '💸', kind: 'wallet', value: 5000 },
  { key: 'holo_skin', name: 'Holo card skin', desc: 'Unlock the exclusive Holo design for your card.', cost: 500, emoji: '🪩', kind: 'skin', value: 0 },
  { key: 'food_100', name: '₹100 food voucher', desc: 'Demo voucher for a partner food app.', cost: 400, emoji: '🍕', kind: 'voucher', value: 0 },
  { key: 'music_1m', name: '1 month of music', desc: 'Demo voucher for a music streaming plan.', cost: 600, emoji: '🎧', kind: 'voucher', value: 0 },
  { key: 'game_200', name: '₹200 gaming credits', desc: 'Demo voucher for in-game credits.', cost: 750, emoji: '🎮', kind: 'voucher', value: 0 },
  { key: 'movie_1', name: 'Movie night ticket', desc: 'Demo voucher for one cinema ticket.', cost: 900, emoji: '🍿', kind: 'voucher', value: 0 },
] as const;

export function redeem(u: User, key: string) {
  const r = REWARDS.find((x) => x.key === key);
  if (!r) throw bad('UNKNOWN_REWARD', 'Reward not found.');
  return tx(() => {
    const fresh = getUser(u.id)!;
    if (fresh.coins < r.cost) throw bad('NOT_ENOUGH_COINS', `You need ${r.cost - fresh.coins} more coins.`);
    if (r.kind === 'skin' && get('SELECT 1 FROM redemptions WHERE user_id = ? AND reward = ?', u.id, key)) throw bad('ALREADY_OWNED', 'You already own this skin.');
    run('UPDATE users SET coins = coins - ? WHERE id = ?', r.cost, u.id);
    const code = r.kind === 'voucher' ? `DEMO-${shortCode(4)}-${shortCode(4)}` : r.kind === 'skin' ? 'UNLOCKED' : 'CREDITED';
    run('INSERT INTO redemptions (id,user_id,reward,cost,code,created_at) VALUES (?,?,?,?,?,?)', uid(), u.id, key, r.cost, code, now());
    if (r.kind === 'wallet') {
      postTxn({ userId: u.id, direction: 'credit', amount: r.value, kind: 'reward', category: 'income', title: 'Reward: wallet boost',
        subtitle: `${r.cost} coins redeemed`, method: 'LevelUp Rewards (simulated)' });
    }
    notify(u.id, 'reward', `Redeemed: ${r.name}`, r.kind === 'wallet' ? `${rupees(r.value)} added to your wallet.` : r.kind === 'skin' ? 'Find it in Cards → Design.' : `Your demo code: ${code}`, '/app/rewards');
    return { code, kind: r.kind, name: r.name, coins: fresh.coins - r.cost };
  });
}

export const ownsHolo = (userId: string) => !!get(`SELECT 1 FROM redemptions WHERE user_id = ? AND reward = 'holo_skin'`, userId);

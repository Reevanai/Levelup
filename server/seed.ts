/**
 * Demo data. Builds a believable six-month history for one family so every
 * screen has something real to show. All of it is simulated.
 *
 *   Teen:   aarav@levelup.demo / demo1234  (PIN 1234)
 *   Parent: priya@levelup.demo / demo1234
 */
import { db, get, run, tx } from './db.ts';
import { DAY, hashSecret, istDay, now, startOfDay, uid } from './lib.ts';
import { createUser } from './routes/auth.ts';
import { notify, postTxn } from './services.ts';
import { evaluateBadges } from './game.ts';

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fictional merchants: [name, category, min ₹, max ₹, weight, channel]
const MERCHANTS: [string, string, number, number, number, 'online' | 'instore'][] = [
  ['Zesto Eats', 'food', 120, 340, 7, 'online'], ['Campus Canteen', 'food', 40, 130, 9, 'instore'], ['Chai Theory', 'food', 30, 90, 6, 'instore'],
  ['Brew Lab Café', 'food', 150, 290, 3, 'instore'], ['MetroRide', 'transport', 20, 60, 8, 'instore'], ['ZipCab', 'transport', 90, 240, 3, 'online'],
  ['UrbanThreads', 'shopping', 400, 1300, 1.2, 'online'], ['QuickKart', 'shopping', 150, 600, 2, 'online'], ['PixelPlay Store', 'gaming', 80, 500, 2.5, 'online'],
  ['CineVerse', 'entertainment', 180, 420, 1.5, 'online'], ['BookNest', 'education', 150, 450, 1.2, 'instore'], ['PrintHub', 'education', 20, 80, 2, 'instore'],
  ['Stationery Stop', 'other', 30, 150, 2, 'instore'],
];
const SUBS: [string, number, number][] = [['StreamBox', 149, 4], ['TuneWave', 119, 11], ['GameVault Pass', 299, 19], ['CloudClips', 99, 23]];
const FRIENDS = ['Kabir R.', 'Meera S.', 'Ishaan K.'];

export function seedDemo() {
  tx(() => {
    const r = rng(20240611);
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    const between = (a: number, b: number) => Math.round((a + r() * (b - a)) / 5) * 5 * 100;
    const weighted = () => {
      const total = MERCHANTS.reduce((a, m) => a + m[4], 0);
      let x = r() * total;
      for (const m of MERCHANTS) { if ((x -= m[4]) <= 0) return m; }
      return MERCHANTS[0];
    };

    const parent = createUser({ role: 'parent', name: 'Priya Mehta', email: 'priya@levelup.demo', password: 'demo1234', avatar: '🦉', isDemo: true });
    const teen = createUser({ role: 'teen', name: 'Aarav Mehta', email: 'aarav@levelup.demo', password: 'demo1234', dob: '2009-03-14', avatar: '🦊', isDemo: true });
    const T = now(), today = startOfDay(T), DAYS = 180;
    run(`UPDATE users SET parent_id = ?, pin_hash = ?, kyc_status = 'demo_verified', onboarded = 1, monthly_budget = 800000, savings_target = 600000, created_at = ? WHERE id = ?`,
      parent.id, hashSecret('1234'), today - DAYS * DAY, teen.id);
    run('UPDATE users SET onboarded = 1, created_at = ? WHERE id = ?', today - DAYS * DAY, parent.id);
    run(`UPDATE cards SET design = 'aurora', approval_threshold = 150000, per_txn_limit = 200000, daily_limit = 300000, monthly_limit = 1200000 WHERE user_id = ?`, teen.id);

    const vaults = {
      pc: { name: 'Gaming PC', emoji: '🖥️', color: '#8b5cf6', target: 8000000, date: istDay(today + 210 * DAY), at: DAYS },
      phone: { name: 'New smartphone', emoji: '📱', color: '#39e58c', target: 2500000, date: istDay(today + 75 * DAY), at: DAYS },
      safety: { name: 'Emergency fund', emoji: '🛟', color: '#38bdf8', target: 1000000, date: null, at: 150 },
      goa: { name: 'Goa trip', emoji: '🏖️', color: '#fb923c', target: 1500000, date: istDay(today + 140 * DAY), at: 20 },
    } as const;
    const vaultIds: Record<string, string> = {};
    for (const [k, v] of Object.entries(vaults)) {
      vaultIds[k] = uid();
      run('INSERT INTO vaults (id,user_id,name,emoji,color,target,target_date,created_at) VALUES (?,?,?,?,?,?,?,?)', vaultIds[k], teen.id, v.name, v.emoji, v.color, v.target, v.date, today - v.at * DAY);
    }

    type Ev = { frac: number; go: (at: number) => void };
    const balance = () => get<{ balance: number }>('SELECT balance FROM wallets WHERE user_id = ?', teen.id)!.balance;
    const credit = (at: number, amount: number, kind: string, title: string, subtitle: string, method: string) =>
      postTxn({ userId: teen.id, direction: 'credit', amount, kind, category: 'income', title, subtitle, method, at });
    const spend = (at: number, amount: number, title: string, category: string, channel: string) => {
      if (balance() - amount < 30000) return;
      postTxn({ userId: teen.id, direction: 'debit', amount, kind: 'card', category, title, subtitle: channel === 'online' ? 'Online payment' : 'In-store payment', method: 'LevelUp Card (simulated)', at });
    };
    const stash = (at: number, key: keyof typeof vaults, amount: number) => {
      if (balance() - amount < 50000) return;
      postTxn({ userId: teen.id, direction: 'debit', amount, kind: 'vault', category: 'savings', title: `Saved to ${vaults[key].name}`, subtitle: 'Savings vault', method: 'Wallet transfer (simulated)', vaultId: vaultIds[key], at });
      run('UPDATE vaults SET saved = saved + ? WHERE id = ?', amount, vaultIds[key]);
      run('INSERT INTO vault_entries (id,vault_id,user_id,amount,created_at) VALUES (?,?,?,?,?)', uid(), vaultIds[key], teen.id, amount, at);
    };

    for (let d = DAYS; d >= 0; d--) {
      const start = today - d * DAY, end = Math.min(start + DAY, T - 90_000);
      const dom = Number(istDay(start).slice(8)), dow = new Date(start + 19800000).getUTCDay();
      const evs: Ev[] = [];
      if (d === DAYS) evs.push({ frac: 0.02, go: (at) => credit(at, 300000, 'topup', 'Added demo money', 'Demo bank account', 'Simulated top-up') });
      if (d % 7 === 0) {
        evs.push({ frac: 0.38, go: (at) => credit(at, 250000, 'allowance', 'Allowance', 'From Priya Mehta', 'Scheduled allowance (simulated)') });
        evs.push({ frac: 0.42, go: (at) => stash(at, 'pc', 90000) });
        evs.push({ frac: 0.43, go: (at) => stash(at, 'phone', 60000) });
        if (d <= 20) evs.push({ frac: 0.44, go: (at) => stash(at, 'goa', 40000) });
      }
      if (d % 30 === 12) {
        const pay = between(4200, 6400);
        evs.push({ frac: 0.5, go: (at) => credit(at, pay, 'transfer', 'From Studio Nine', 'Poster design gig', 'Wallet transfer (simulated)') });
        evs.push({ frac: 0.55, go: (at) => stash(at, 'pc', 200000) });
        if (d <= 150) evs.push({ frac: 0.56, go: (at) => stash(at, 'safety', 100000) });
      }
      if (d === 96) evs.push({ frac: 0.4, go: (at) => credit(at, 500000, 'transfer', 'From Nani', 'Birthday gift 🎂', 'Wallet transfer (simulated)') }, { frac: 0.6, go: (at) => stash(at, 'phone', 250000) });
      if (d === 18) evs.push({ frac: 0.7, go: (at) => stash(at, 'goa', 130000) });
      for (const [name, price, day] of SUBS) if (dom === day) evs.push({ frac: 0.25, go: (at) => spend(at, price * 100, name, 'subscriptions', 'online') });
      const weekend = dow === 0 || dow === 6;
      const n = Math.floor(r() * (weekend ? 3.4 : 2.3));
      for (let i = 0; i < n; i++) {
        const m = weighted();
        evs.push({ frac: 0.3 + r() * 0.65, go: (at) => spend(at, between(m[2], m[3]), m[0], m[1], m[5]) });
      }
      if (r() < 0.07) {
        const amt = between(150, 500), who = pick(FRIENDS);
        evs.push({ frac: 0.8, go: (at) => { if (balance() - amt > 30000) postTxn({ userId: teen.id, direction: 'debit', amount: amt, kind: 'transfer', category: 'other', title: `To ${who}`, subtitle: `${who.split(' ')[0].toLowerCase()}@levelup`, note: pick(['Pizza split 🍕', 'Movie tickets', 'Cab share', 'Thanks!']), method: 'Wallet transfer (simulated)', at }); } });
      }
      evs.sort((a, b) => a.frac - b.frac).forEach((e) => e.go(Math.floor(start + e.frac * (end - start))));
    }

    // Rewards history: a 6-day streak that today's check-in turns into 7.
    for (let d = 1; d <= 6; d++) run('INSERT INTO checkins (user_id, day) VALUES (?,?)', teen.id, istDay(today - d * DAY));
    for (const d of [9, 10, 11, 13, 16, 17, 20, 24, 25]) run('INSERT INTO checkins (user_id, day) VALUES (?,?)', teen.id, istDay(today - d * DAY));
    run('UPDATE users SET streak = 6, streak_day = ?, xp = 2340, coins = 860 WHERE id = ?', istDay(today - DAY), teen.id);
    const xp: [number, number, string][] = [[1, 20, 'Daily expense check-in'], [2, 20, 'Daily expense check-in'], [2, 40, 'Quiz: Budgeting basics'], [3, 20, 'Daily expense check-in'],
      [4, 120, 'Mission: Save ₹500 this week'], [8, 150, 'Mission: Stay within your spending limit'], [12, 100, 'Mission: Track expenses for 5 days'], [15, 40, 'Quiz: Stay scam-proof'], [30, 300, 'Mission: Reach your monthly savings target']];
    let seeded = 0;
    for (const [d, amount, reason] of xp) { seeded += amount; run('INSERT INTO xp_events (id,user_id,xp,coins,reason,created_at) VALUES (?,?,?,?,?,?)', uid(), teen.id, amount, amount / 2, reason, today - d * DAY + 13 * 3600_000); }
    run('INSERT INTO xp_events (id,user_id,xp,coins,reason,created_at) VALUES (?,?,?,?,?,?)', uid(), teen.id, 2340 - seeded, 0, 'Earlier progress', today - 45 * DAY);
    run('INSERT INTO mission_claims (user_id,mission,period,claimed_at) VALUES (?,?,?,?)', teen.id, 'within_limit', 'seed', today - 8 * DAY);
    for (const [quiz, d] of [['budget_basics', 2], ['pay_safe', 15]] as const) run('INSERT INTO quiz_attempts (user_id,quiz,score,passed,created_at) VALUES (?,?,3,1,?)', teen.id, quiz, today - d * DAY);
    evaluateBadges(teen.id, today - 3 * DAY, true);

    run('INSERT INTO allowances (child_id,parent_id,amount,frequency,active,next_run) VALUES (?,?,?,?,1,?)', teen.id, parent.id, 250000, 'weekly', today + 7 * DAY + 9 * 3600_000);

    // Things waiting to be acted on.
    const approval = uid(), req1 = uid();
    run(`INSERT INTO approvals (id,child_id,parent_id,type,title,detail,amount,payload,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      approval, teen.id, parent.id, 'money_request', 'Requested ₹800', 'Class trip to the science museum', 80000, JSON.stringify({ note: 'Class trip to the science museum' }), T - 3 * 3600_000);
    run('INSERT INTO money_requests (id,user_id,from_name,from_handle,amount,note,approval_id,created_at) VALUES (?,?,?,?,?,?,?,?)', req1, teen.id, parent.name, parent.handle, 80000, 'Class trip to the science museum', approval, T - 3 * 3600_000);
    run('INSERT INTO money_requests (id,user_id,from_name,from_handle,amount,note,created_at) VALUES (?,?,?,?,?,?,?)', uid(), teen.id, 'Kabir R.', 'kabir@levelup', 24000, 'Your half of the pizza 🍕', T - 26 * 3600_000);

    notify(teen.id, 'reward', 'One check-in from a 7-day streak 🔥', 'Check in today for a 50 XP streak bonus.', '/app/rewards', T - 40 * 60_000);
    notify(teen.id, 'txn', 'Allowance received: ₹2,500', 'Fresh funds. Stash a slice in a vault?', '/app/vaults', T - 2 * 3600_000);
    notify(teen.id, 'approval', 'Request sent to Priya', '₹800 for the class trip is waiting for approval.', '/app/wallet', T - 3 * 3600_000);
    notify(teen.id, 'insight', 'Your subscriptions add up', 'Four recurring charges this month. See what you could pause.', '/app/assistant', T - 20 * 3600_000);
    notify(parent.id, 'approval', 'Aarav needs your approval', 'Requested ₹800 · Class trip to the science museum', '/parent', T - 3 * 3600_000);
    notify(parent.id, 'child_save', 'Aarav saved ₹1,500 this week', 'Into Gaming PC and New smartphone', '/parent', T - 2 * 3600_000);
    run('UPDATE notifications SET read = 1 WHERE user_id = ? AND created_at < ?', teen.id, T - 5 * 3600_000);
  });
}

if (process.argv[1]?.endsWith('seed.ts')) {
  if (process.argv.includes('--reset')) {
    db.exec('PRAGMA foreign_keys = OFF;');
    for (const t of ['notifications', 'approvals', 'allowances', 'quiz_attempts', 'redemptions', 'badges', 'mission_claims', 'checkins', 'xp_events', 'vault_entries', 'vaults', 'cards', 'money_requests', 'transactions', 'wallets', 'sessions', 'users']) db.exec(`DELETE FROM ${t}`);
    db.exec('PRAGMA foreign_keys = ON;');
  }
  if (get('SELECT 1 FROM users LIMIT 1')) console.log('Database already has users. Run with --reset to rebuild the demo data.');
  else { seedDemo(); console.log('Seeded demo family: aarav@levelup.demo / priya@levelup.demo (password demo1234, PIN 1234)'); }
}

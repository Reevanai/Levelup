/**
 * Financial intelligence. Deliberately rules-based and explainable: every
 * statement is derived from the user's own simulated ledger. A language model
 * could be layered on later behind the same `ask()` contract.
 */
import { all, get } from './db.ts';
import { DAY, addMonths, monthLabel, now, rupees, startOfMonth, startOfWeek } from './lib.ts';
import { SPEND, balanceOf, catLabel, categoryBreakdown, sumIncome, sumSaved, sumSpend, type User } from './services.ts';
import { currentStreak } from './game.ts';

const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));
const whole = (paise: number) => Math.round(paise / 100) * 100;
const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

export function monthlyTrend(userId: string, months = 6) {
  const cur = startOfMonth(now());
  return Array.from({ length: months }, (_, i) => {
    const from = addMonths(cur, i - months + 1), to = addMonths(from, 1);
    return { label: monthLabel(from), from, spent: sumSpend(userId, from, to), income: sumIncome(userId, from, to), saved: Math.max(0, sumSaved(userId, from, to)) };
  });
}

export function dailySpend(userId: string, days = 7) {
  const today = Math.floor((now() + 19800000) / DAY) * DAY - 19800000;
  return Array.from({ length: days }, (_, i) => {
    const from = today - (days - 1 - i) * DAY;
    return { label: new Date(from + 19800000).toLocaleString('en-IN', { weekday: 'short', timeZone: 'UTC' }), from, spent: sumSpend(userId, from, from + DAY) };
  });
}

export function healthScore(u: User) {
  const t = now(), m0 = startOfMonth(t), prev = addMonths(m0, -1);
  // Use the last ~60 days so the score doesn't whiplash on the 1st of the month.
  const income = sumIncome(u.id, prev), spent = sumSpend(u.id, prev), saved = Math.max(0, sumSaved(u.id, prev));
  const savingsRate = income ? saved / income : 0;
  const monthSpent = sumSpend(u.id, m0);
  const dayOfMonth = Math.floor((t - m0) / DAY) + 1;
  const pace = u.monthly_budget ? monthSpent / (u.monthly_budget * Math.min(1, dayOfMonth / 30)) : 1;
  const vaults = all<{ saved: number; target: number }>('SELECT saved, target FROM vaults WHERE user_id = ?', u.id);
  const vaultProgress = vaults.length ? vaults.reduce((a, v) => a + Math.min(1, v.saved / v.target), 0) / vaults.length : 0;

  const parts = [
    { key: 'saving', label: 'Saving habit', max: 40, score: Math.round(Math.min(1, savingsRate / 0.25) * 40), hint: `You save ${Math.round(savingsRate * 100)}% of what comes in. 25% maxes this out.` },
    { key: 'budget', label: 'Budget control', max: 30, score: Math.round(Math.max(0, Math.min(1, 1.6 - pace)) * 30), hint: pace <= 1 ? 'Spending is on pace with your monthly budget.' : 'You are spending faster than your budget allows.' },
    { key: 'goals', label: 'Goal progress', max: 15, score: Math.round(vaultProgress * 15), hint: vaults.length ? `Your vaults are ${Math.round(vaultProgress * 100)}% funded on average.` : 'Create a vault to start building this.' },
    { key: 'consistency', label: 'Consistency', max: 15, score: Math.round(Math.min(1, currentStreak(u) / 7) * 15), hint: `${currentStreak(u)}-day check-in streak. Seven days maxes this out.` },
  ];
  const score = income + spent + saved === 0 ? 0 : parts.reduce((a, p) => a + p.score, 0);
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Strong' : score >= 40 ? 'Building' : score > 0 ? 'Needs work' : 'No data yet';
  return { score, label, parts };
}

export interface Insight { id: string; tone: 'good' | 'warn' | 'info'; emoji: string; title: string; body: string; saving?: number }

export function buildInsights(u: User): Insight[] {
  const t = now(), m0 = startOfMonth(t), p0 = addMonths(m0, -1);
  const out: Insight[] = [];
  const cur = categoryBreakdown(u.id, m0), prev = categoryBreakdown(u.id, p0, m0);
  const total = cur.reduce((a, c) => a + c.total, 0);
  const elapsed = Math.max(1, (t - m0) / DAY), prevDays = (m0 - p0) / DAY;

  const top = [...cur].sort((a, b) => b.total - a.total)[0];
  if (top && top.total > 0) {
    out.push({ id: 'top', tone: 'info', emoji: top.emoji, title: `${top.label} is your biggest spend`,
      body: `${rupees(top.total)} across ${top.count} payments — ${pct(top.total, total)}% of this month's spending.` });
  }
  // Categories running hot versus last month's daily pace.
  for (const c of cur) {
    const before = prev.find((p) => p.key === c.key)!.total;
    const paceNow = c.total / elapsed, paceBefore = before / prevDays;
    if (before > 20000 && c.total > 30000 && paceNow > paceBefore * 1.3) {
      out.push({ id: `hot-${c.key}`, tone: 'warn', emoji: '📈', title: `${c.label} is running ${pct(paceNow - paceBefore, paceBefore)}% hotter`,
        body: `You're averaging ${rupees(whole(paceNow))}/day here versus ${rupees(whole(paceBefore))}/day last month.` });
      break;
    }
  }
  // Recurring charges: same merchant billed in 2+ distinct months.
  const subs = all<{ title: string; months: number; avg: number }>(
    `SELECT title, COUNT(DISTINCT strftime('%Y-%m', created_at/1000, 'unixepoch')) months, CAST(AVG(amount) AS INTEGER) avg
     FROM transactions WHERE user_id = ? AND ${SPEND} AND category = 'subscriptions' AND created_at >= ? GROUP BY title HAVING months >= 2 ORDER BY avg DESC`,
    u.id, addMonths(m0, -3));
  if (subs.length >= 2) {
    const cheapest = subs[subs.length - 1];
    out.push({ id: 'subs', tone: 'warn', emoji: '🔁', title: `${subs.length} subscriptions cost you ${rupees(subs.reduce((a, s) => a + s.avg, 0))}/month`,
      body: `${subs.map((s) => s.title).join(', ')}. Pausing ${cheapest.title} alone frees up ${rupees(cheapest.avg * 12)} a year.`, saving: cheapest.avg });
  }
  // Small, frequent food orders.
  const food = get<{ n: number; s: number }>(`SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND ${SPEND} AND category = 'food' AND created_at >= ?`, u.id, t - 30 * DAY)!;
  if (food.n >= 10) {
    const cut = whole((food.s / food.n) * Math.ceil(food.n / 4));
    out.push({ id: 'food', tone: 'warn', emoji: '🍜', title: `${food.n} food orders in 30 days`,
      body: `That's ${rupees(food.s)}, about ${rupees(whole(food.s / food.n))} each. Skipping one in four would save ~${rupees(cut)} a month.`, saving: cut });
  }
  // Weekend skew.
  const wk = get<{ wkend: number; total: number }>(
    `SELECT COALESCE(SUM(CASE WHEN strftime('%w', (created_at + 19800000)/1000, 'unixepoch') IN ('0','6') THEN amount ELSE 0 END),0) wkend, COALESCE(SUM(amount),0) total
     FROM transactions WHERE user_id = ? AND ${SPEND} AND created_at >= ?`, u.id, t - 30 * DAY)!;
  if (wk.total > 0 && wk.wkend / wk.total > 0.45) {
    out.push({ id: 'weekend', tone: 'info', emoji: '🗓️', title: `${pct(wk.wkend, wk.total)}% of your spending happens on weekends`,
      body: 'Setting a weekend cap before Saturday is the easiest way to keep it in check.' });
  }
  // Budget pace.
  if (u.monthly_budget > 0 && total > 0) {
    const projected = whole((total / elapsed) * 30);
    out.push(projected <= u.monthly_budget
      ? { id: 'pace', tone: 'good', emoji: '✅', title: 'On track for your budget', body: `At this pace you'll spend about ${rupees(projected)} of your ${rupees(u.monthly_budget)} budget.` }
      : { id: 'pace', tone: 'warn', emoji: '⚠️', title: 'Heading over budget', body: `At this pace you'll spend about ${rupees(projected)}, which is ${rupees(projected - u.monthly_budget)} over your ${rupees(u.monthly_budget)} budget.` });
  }
  const saved = Math.max(0, sumSaved(u.id, m0));
  if (saved > 0) out.push({ id: 'saved', tone: 'good', emoji: '🏆', title: `${rupees(saved)} saved this month`, body: `That's ${pct(saved, u.savings_target)}% of your ${rupees(u.savings_target)} monthly target.` });
  return out;
}

export function savingsSuggestion(u: User) {
  const trend = monthlyTrend(u.id, 4).slice(0, 3); // three full months
  const avgIncome = trend.reduce((a, m) => a + m.income, 0) / 3, avgSpent = trend.reduce((a, m) => a + m.spent, 0) / 3;
  if (avgIncome === 0) return { suggested: 50000, reason: 'Start small: ₹500 a month builds the habit. We will tune this once you have some history.', avgIncome: 0, avgSpent: 0 };
  const surplus = Math.max(0, avgIncome - avgSpent);
  const suggested = roundTo(Math.max(avgIncome * 0.2, Math.min(surplus * 0.7, avgIncome * 0.4)), 10000);
  return { suggested, avgIncome: Math.round(avgIncome), avgSpent: Math.round(avgSpent),
    reason: `You bring in about ${rupees(whole(avgIncome))} a month and spend about ${rupees(whole(avgSpent))}. Saving ${rupees(suggested)} keeps roughly ${pct(suggested, avgIncome)}% aside and still leaves room to live.` };
}

export function monthlyReport(u: User, offset = 0) {
  const from = addMonths(startOfMonth(now()), offset), to = addMonths(from, 1), prevFrom = addMonths(from, -1);
  const income = sumIncome(u.id, from, to), spent = sumSpend(u.id, from, to), saved = Math.max(0, sumSaved(u.id, from, to));
  const prevSpent = sumSpend(u.id, prevFrom, from);
  const cats = categoryBreakdown(u.id, from, to).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  const merchants = all<{ title: string; total: number; n: number }>(
    `SELECT title, SUM(amount) total, COUNT(*) n FROM transactions WHERE user_id = ? AND ${SPEND} AND created_at >= ? AND created_at < ? GROUP BY title ORDER BY total DESC LIMIT 5`, u.id, from, to);
  const biggest = get<{ title: string; amount: number; created_at: number }>(
    `SELECT title, amount, created_at FROM transactions WHERE user_id = ? AND ${SPEND} AND created_at >= ? AND created_at < ? ORDER BY amount DESC LIMIT 1`, u.id, from, to);
  const rate = income ? saved / income : 0;
  const within = spent <= u.monthly_budget;
  const grade = income + spent === 0 ? '—' : rate >= 0.25 && within ? 'A' : rate >= 0.15 && within ? 'B' : rate >= 0.08 || within ? 'C' : 'D';
  const month = new Date(from + 19800000).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const highlights: string[] = [];
  if (income + spent > 0) {
    highlights.push(`You received ${rupees(income)} and spent ${rupees(spent)}.`);
    if (prevSpent > 0) highlights.push(spent <= prevSpent ? `Spending is down ${pct(prevSpent - spent, prevSpent)}% on the month before.` : `Spending is up ${pct(spent - prevSpent, prevSpent)}% on the month before.`);
    if (cats[0]) highlights.push(`${cats[0].label} led at ${rupees(cats[0].total)} (${pct(cats[0].total, spent)}%).`);
    highlights.push(saved > 0 ? `You moved ${rupees(saved)} into vaults — a ${Math.round(rate * 100)}% savings rate.` : 'Nothing went into vaults this month.');
    highlights.push(within ? `You stayed inside your ${rupees(u.monthly_budget)} budget.` : `You went ${rupees(spent - u.monthly_budget)} over your ${rupees(u.monthly_budget)} budget.`);
  }
  return { month, offset, income, spent, saved, prevSpent, savingsRate: rate, grade, budget: u.monthly_budget, categories: cats, merchants, biggest: biggest ?? null, highlights, generatedAt: now() };
}

// ---------- assistant ----------
export interface Answer { text: string; bullets: string[]; followups: string[]; link?: { label: string; to: string } }
const DEFAULT_FOLLOWUPS = ['Where is my money going?', 'What can I cut?', 'How much should I save?', 'Can I afford ₹2,000 headphones?'];
const TIPS = [
  'The 50/30/20 rule: roughly half on needs, 30% on wants, 20% saved. As a student with few "needs", try flipping it and saving more.',
  'Pay yourself first: move money to a vault the day allowance lands, then spend what is left.',
  'Before a want over ₹1,000, wait 48 hours. If you still want it, buy it guilt-free.',
  'Never share an OTP or PIN. A genuine payment request never needs your PIN to *receive* money.',
  'An emergency fund of even ₹5,000 means a cracked screen is an inconvenience, not a crisis.',
];

export function ask(u: User, raw: string): Answer {
  const q = raw.toLowerCase();
  const t = now(), m0 = startOfMonth(t);
  const cats = categoryBreakdown(u.id, m0).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  const spent = cats.reduce((a, c) => a + c.total, 0);
  const left = u.monthly_budget - spent;
  const insights = buildInsights(u);
  const amountMatch = q.replace(/,/g, '').match(/(?:₹|rs\.?\s*|inr\s*)?(\d{2,7})/);

  if (/afford|should i buy|can i buy|can i get/.test(q) && amountMatch) {
    const amt = Number(amountMatch[1]) * 100, bal = balanceOf(u.id);
    const weeklyFree = Math.max(0, whole(left / Math.max(1, (addMonths(m0, 1) - t) / (7 * DAY))));
    const verdict = amt > bal ? `Not yet. It costs ${rupees(amt)} and your wallet has ${rupees(bal)}.`
      : amt > left ? `You have the cash, but it would push you ${rupees(amt - Math.max(0, left))} past your monthly budget.`
      : amt > left * 0.5 ? `Yes, but it eats ${pct(amt, Math.max(left, 1))}% of what's left in your budget this month.`
      : `Yes. It fits comfortably within the ${rupees(left)} left in your budget.`;
    return { text: verdict, bullets: [`Wallet balance: ${rupees(bal)}`, `Budget left this month: ${rupees(Math.max(0, left))}`, `Free to spend per remaining week: about ${rupees(weeklyFree)}`,
      amt > left ? `Tip: a vault with ${rupees(Math.ceil(amt / 4 / 100) * 100)} a week gets you there in a month.` : 'Tip: sleep on it for 48 hours. Still want it? Go for it.'],
      followups: ['What can I cut?', 'How much should I save?'], link: amt > left ? { label: 'Create a vault for it', to: '/app/vaults' } : undefined };
  }
  if (/cut|waste|unnecessar|subscription|reduce|too much|leak/.test(q)) {
    const warn = insights.filter((i) => i.tone === 'warn');
    const saving = warn.reduce((a, i) => a + (i.saving ?? 0), 0);
    return warn.length
      ? { text: saving ? `I found ${warn.length} things worth a look. Together they could free up about ${rupees(saving)} a month.` : `I found ${warn.length} things worth a look.`,
          bullets: warn.map((i) => `${i.title}. ${i.body}`), followups: ['How much should I save?', 'Show my monthly report'] }
      : { text: 'Nothing jumps out as wasteful right now. Nice discipline.', bullets: [], followups: DEFAULT_FOLLOWUPS };
  }
  if (/how much.*save|saving|save|target|goal/.test(q)) {
    const s = savingsSuggestion(u), saved = Math.max(0, sumSaved(u.id, m0));
    return { text: `I'd aim for ${rupees(s.suggested)} a month.`, bullets: [s.reason, `Your current target is ${rupees(u.savings_target)} and you've saved ${rupees(saved)} so far this month.`,
      `Weekly, that's about ${rupees(roundTo(s.suggested / 4.3, 5000))}.`], followups: ['What can I cut?', 'Can I afford ₹2,000 headphones?'], link: { label: 'Open vaults', to: '/app/vaults' } };
  }
  if (/report|summary|recap|last month/.test(q)) {
    const r = monthlyReport(u, /last/.test(q) ? -1 : 0);
    return { text: `Here's ${r.month} in short. Grade: ${r.grade}.`, bullets: r.highlights, followups: ['What can I cut?', 'How is my financial health?'] };
  }
  if (/budget|left|limit|remaining/.test(q)) {
    return { text: left >= 0 ? `You have ${rupees(left)} left of your ${rupees(u.monthly_budget)} budget this month.` : `You're ${rupees(-left)} over your ${rupees(u.monthly_budget)} budget this month.`,
      bullets: [`Spent so far: ${rupees(spent)}`, `This week: ${rupees(sumSpend(u.id, startOfWeek(t)))}`], followups: ['Where is my money going?', 'What can I cut?'] };
  }
  if (/health|score|doing/.test(q)) {
    const h = healthScore(u);
    return { text: `Your financial health score is ${h.score}/100 — ${h.label}.`, bullets: h.parts.map((p) => `${p.label}: ${p.score}/${p.max}. ${p.hint}`), followups: ['How much should I save?', 'What can I cut?'] };
  }
  if (/tip|learn|teach|advice|rule|scam|safe/.test(q)) {
    return { text: TIPS[Math.floor(t / 1000) % TIPS.length], bullets: [], followups: ['Give me another tip', 'How is my financial health?'], link: { label: 'Take a money quiz', to: '/app/assistant?tab=learn' } };
  }
  if (/spend|spent|where|money going|categor|pattern|most/.test(q)) {
    return spent === 0
      ? { text: "You haven't spent anything this month yet, so there's no pattern to read.", bullets: [], followups: DEFAULT_FOLLOWUPS }
      : { text: `You've spent ${rupees(spent)} this month. ${cats[0].label} leads at ${pct(cats[0].total, spent)}%.`,
          bullets: cats.slice(0, 5).map((c) => `${c.emoji} ${c.label}: ${rupees(c.total)} (${c.count} payments)`), followups: ['What can I cut?', 'How much budget is left?'] };
  }
  return { text: "I can read your spending and help you plan. Try one of these:", bullets: [], followups: DEFAULT_FOLLOWUPS };
}

// ---------- literacy quizzes ----------
export const QUIZZES = [
  { key: 'budget_basics', title: 'Budgeting basics', emoji: '📊', minutes: 2, xp: 40, questions: [
    { q: 'In the 50/30/20 rule, what does the 20 stand for?', options: ['Wants', 'Savings', 'Rent', 'Taxes'], answer: 1, why: '50% needs, 30% wants, 20% savings.' },
    { q: 'Which of these is a "need"?', options: ['Concert tickets', 'New sneakers', 'Bus fare to college', 'A game skin'], answer: 2, why: 'Needs are things you cannot reasonably go without.' },
    { q: '"Pay yourself first" means…', options: ['Buy what you want first', 'Save before you spend', 'Pay bills late', 'Lend to friends'], answer: 1, why: 'Move savings out on payday, then spend what remains.' } ] },
  { key: 'compounding', title: 'The magic of compounding', emoji: '📈', minutes: 2, xp: 40, questions: [
    { q: 'Compound interest is earned on…', options: ['Only your deposit', 'Your deposit plus past interest', 'Only past interest', 'Your spending'], answer: 1, why: 'Interest earns interest, which is why time matters so much.' },
    { q: 'At roughly 8% a year, money doubles in about…', options: ['3 years', '9 years', '20 years', '40 years'], answer: 1, why: 'Rule of 72: 72 ÷ 8 ≈ 9 years.' },
    { q: 'Who usually ends up with more?', options: ['Starts at 18, small amounts', 'Starts at 30, same amounts', 'No difference', 'Depends on luck only'], answer: 0, why: 'Starting early gives compounding more years to work.' } ] },
  { key: 'pay_safe', title: 'Stay scam-proof', emoji: '🛡️', minutes: 2, xp: 40, questions: [
    { q: 'To RECEIVE money on a payment app you need to…', options: ['Enter your PIN', 'Share an OTP', 'Do nothing', 'Scan a QR and pay'], answer: 2, why: 'A PIN is only ever needed to send money. Anyone asking for it to "receive" is scamming you.' },
    { q: 'A caller says they are from your bank and asks for an OTP. You…', options: ['Share it quickly', 'Hang up and never share it', 'Share half', 'Ask them to email'], answer: 1, why: 'No genuine institution asks for your OTP.' },
    { q: 'A "you won ₹5,000!" link from an unknown number is…', options: ['Free money', 'Probably phishing', 'A government scheme', 'Safe if it has https'], answer: 1, why: 'Unexpected prize links are a classic phishing lure.' } ] },
  { key: 'wants_needs', title: 'Smart spending', emoji: '🧠', minutes: 2, xp: 40, questions: [
    { q: 'The 48-hour rule helps you avoid…', options: ['Late fees', 'Impulse buys', 'Taxes', 'Saving too much'], answer: 1, why: 'Waiting two days filters out purchases you only wanted in the moment.' },
    { q: 'A ₹199/month subscription costs how much a year?', options: ['₹1,199', '₹1,990', '₹2,388', '₹3,000'], answer: 2, why: '199 × 12 = ₹2,388. Small monthly charges add up.' },
    { q: 'An emergency fund is for…', options: ['A sale', 'Unexpected essential costs', 'A new phone launch', 'Lending to friends'], answer: 1, why: 'It covers surprises like repairs or medical costs.' } ] },
] as const;

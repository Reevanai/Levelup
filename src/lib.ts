import { CATEGORIES } from '../shared/constants';

export const inr = (paise: number, opts: { sign?: boolean } = {}) => {
  const abs = Math.abs(paise) / 100;
  const s = '₹' + abs.toLocaleString('en-IN', { minimumFractionDigits: paise % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  return opts.sign ? (paise < 0 ? '−' : '+') + s : paise < 0 ? '−' + s : s;
};
export const inrShort = (paise: number) => {
  const r = paise / 100;
  if (r >= 100000) return `₹${(r / 100000).toFixed(r % 100000 === 0 ? 0 : 1)}L`;
  if (r >= 1000) return `₹${(r / 1000).toFixed(r % 1000 === 0 ? 0 : 1)}k`;
  return `₹${Math.round(r)}`;
};
/** "1,250.50" typed by a person → paise, or null if it isn't a sensible amount. */
export const toPaise = (s: string) => {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};
export const pct = (a: number, b: number) => (b <= 0 ? 0 : Math.min(100, Math.round((a / b) * 100)));

const tz = { timeZone: 'Asia/Kolkata' } as const;
export const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', ...tz });
export const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', ...tz });
export const fmtDay = (iso: string) => new Date(iso + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', ...tz });
export function dayLabel(ts: number) {
  const key = (t: number) => new Date(t).toLocaleDateString('en-CA', tz);
  const now = Date.now();
  if (key(ts) === key(now)) return 'Today';
  if (key(ts) === key(now - 86400000)) return 'Yesterday';
  return new Date(ts).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', ...tz });
}
export function ago(ts: number) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  if (m < 10080) return `${Math.round(m / 1440)}d ago`;
  return fmtDate(ts);
}
export function until(ts: number) {
  const h = Math.max(0, Math.round((ts - Date.now()) / 3600000));
  return h < 24 ? `${Math.max(1, h)}h left` : `${Math.round(h / 24)}d left`;
}
export const greeting = () => {
  const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, ...tz }));
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export const catOf = (key: string) => CATEGORIES.find((c) => c.key === key);
export function txnVisual(t: { category: string; kind: string; direction: string }) {
  const c = catOf(t.category);
  if (c) return { emoji: c.emoji, label: c.label };
  if (t.kind === 'vault') return { emoji: '🔐', label: 'Savings vault' };
  if (t.kind === 'allowance') return { emoji: '🗓️', label: 'Allowance' };
  if (t.kind === 'reward') return { emoji: '🎁', label: 'Reward' };
  return { emoji: t.direction === 'credit' ? '💰' : '💸', label: t.direction === 'credit' ? 'Money in' : 'Money out' };
}

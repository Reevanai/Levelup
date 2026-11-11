import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from 'node:crypto';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}
export const bad = (code: string, message: string, extra?: Record<string, unknown>) => new HttpError(400, code, message, extra);

// ---------- time (all product logic runs on India Standard Time) ----------
const IST = 5.5 * 3600 * 1000;
export const DAY = 24 * 3600 * 1000;
export const now = () => Date.now();
export const istDay = (ts: number) => new Date(ts + IST).toISOString().slice(0, 10);
export const monthKey = (ts: number) => istDay(ts).slice(0, 7);
export const startOfDay = (ts: number) => Math.floor((ts + IST) / DAY) * DAY - IST;
/** Monday 00:00 IST of the week containing ts. */
export function startOfWeek(ts: number) {
  const d0 = startOfDay(ts);
  const dow = (new Date(d0 + IST).getUTCDay() + 6) % 7; // Mon = 0
  return d0 - dow * DAY;
}
export function startOfMonth(ts: number) {
  const d = new Date(ts + IST);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - IST;
}
export function addMonths(monthStart: number, n: number) {
  const d = new Date(monthStart + IST);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1) - IST;
}
export const weekKey = (ts: number) => istDay(startOfWeek(ts));
export const monthLabel = (ts: number) =>
  new Date(ts + IST).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' });

// ---------- ids & secrets ----------
export const uid = () => randomUUID();
export const shortCode = (n = 6) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(n), (b) => alphabet[b % alphabet.length]).join('');
};
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export function hashSecret(secret: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, 32);
  return `s1$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export function verifySecret(secret: string, stored: string | null | undefined) {
  if (!stored) return false;
  const [, saltHex, hashHex] = stored.split('$');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(secret, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export const rupees = (paise: number) =>
  '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: paise % 100 === 0 ? 0 : 2 });

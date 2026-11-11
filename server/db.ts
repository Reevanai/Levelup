import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const file = process.env.LEVELUP_DB ?? 'data/levelup.db';
if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

export const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

// All money columns are integer paise.
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('teen','parent')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  handle TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  pin_hash TEXT,
  pin_fails INTEGER NOT NULL DEFAULT 0,
  pin_locked_until INTEGER NOT NULL DEFAULT 0,
  dob TEXT,
  avatar TEXT NOT NULL DEFAULT '🦊',
  parent_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  family_code TEXT UNIQUE,
  kyc_status TEXT NOT NULL DEFAULT 'not_started',
  onboarded INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  streak_day TEXT,
  monthly_budget INTEGER NOT NULL DEFAULT 800000,
  savings_target INTEGER NOT NULL DEFAULT 200000,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0)
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  kind TEXT NOT NULL,            -- topup | transfer | card | vault | allowance | reward
  category TEXT NOT NULL,        -- spending category, or 'income' / 'savings'
  title TEXT NOT NULL,
  subtitle TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  method TEXT NOT NULL,
  provider_ref TEXT NOT NULL,
  balance_after INTEGER NOT NULL,
  vault_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tx_user_time ON transactions(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS money_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_name TEXT NOT NULL,
  from_handle TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | paid | declined | cancelled
  approval_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  design TEXT NOT NULL DEFAULT 'nebula',
  last4 TEXT NOT NULL,
  expiry TEXT NOT NULL,
  frozen INTEGER NOT NULL DEFAULT 0,
  parent_locked INTEGER NOT NULL DEFAULT 0,
  online_enabled INTEGER NOT NULL DEFAULT 1,
  instore_enabled INTEGER NOT NULL DEFAULT 1,
  international_enabled INTEGER NOT NULL DEFAULT 0,
  notify_txn INTEGER NOT NULL DEFAULT 1,
  per_txn_limit INTEGER NOT NULL DEFAULT 200000,
  daily_limit INTEGER NOT NULL DEFAULT 300000,
  monthly_limit INTEGER NOT NULL DEFAULT 1500000,
  blocked_categories TEXT NOT NULL DEFAULT '[]',
  approval_threshold INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vaults (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  color TEXT NOT NULL,
  target INTEGER NOT NULL,
  saved INTEGER NOT NULL DEFAULT 0 CHECK (saved >= 0),
  target_date TEXT,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS vault_entries (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,       -- positive deposit, negative withdrawal
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS xp_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  xp INTEGER NOT NULL,
  coins INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS xp_user_time ON xp_events(user_id, created_at);
CREATE TABLE IF NOT EXISTS checkins (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS mission_claims (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission TEXT NOT NULL,
  period TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, mission, period)
);
CREATE TABLE IF NOT EXISTS badges (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, badge)
);
CREATE TABLE IF NOT EXISTS redemptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward TEXT NOT NULL,
  cost INTEGER NOT NULL,
  code TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS quiz_attempts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz TEXT NOT NULL,
  score INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notif_user_time ON notifications(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,            -- money_request | purchase | limit_increase
  title TEXT NOT NULL,
  detail TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | declined
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS allowances (
  child_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  parent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly','monthly')),
  active INTEGER NOT NULL DEFAULT 1,
  next_run INTEGER NOT NULL
);
`);

type P = string | number | null;
export const get = <T = any>(sql: string, ...p: P[]) => db.prepare(sql).get(...p) as T | undefined;
export const all = <T = any>(sql: string, ...p: P[]) => db.prepare(sql).all(...p) as T[];
export const run = (sql: string, ...p: P[]) => db.prepare(sql).run(...p);

let depth = 0;
/** Run fn atomically. Nested calls join the outer transaction. */
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

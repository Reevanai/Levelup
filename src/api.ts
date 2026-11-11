export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public data: Record<string, unknown> = {}) { super(message); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: { 'Content-Type': 'application/json', 'X-LevelUp-Client': 'web' },
      credentials: 'same-origin',
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', "Can't reach LevelUp. Check your connection and try again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? 'Something went wrong. Please try again.', e);
  }
  return data as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

// ---- shapes returned by the API ----
export interface Level { level: number; title: string; xp: number; floor: number; next: number; progress: number; toNext: number }
export interface Me {
  id: string; role: 'teen' | 'parent'; name: string; email: string; handle: string; avatar: string; dob: string | null;
  kycStatus: string; onboarded: boolean; isDemo: boolean; hasPin: boolean; familyCode: string | null; parent: { name: string; avatar: string } | null;
  monthlyBudget: number; savingsTarget: number; settings: Record<string, boolean>; level: Level; coins: number; streak: number; balance: number; unread: number; createdAt: number;
}
export interface Txn {
  id: string; direction: 'credit' | 'debit'; amount: number; kind: string; category: string; title: string; subtitle: string | null; note: string | null;
  status: string; method: string; ref: string; balanceAfter: number; vaultId: string | null; createdAt: number;
}
export interface Cat { key: string; label: string; color: string; emoji: string; total: number; count: number }
export interface Vault { id: string; name: string; emoji: string; color: string; target: number; saved: number; targetDate: string | null; completedAt: number | null; createdAt?: number }
export interface Mission { key: string; group: 'weekly' | 'monthly' | 'challenge'; title: string; desc: string; xp: number; coins: number; unit: 'money' | 'count'; current: number; target: number; inverse: boolean; progress: number; status: 'in_progress' | 'claimable' | 'claimed' | 'failed'; endsAt: number | null }
export interface BadgeT { key: string; name: string; desc: string; emoji: string; earnedAt?: number | null }
export interface Health { score: number; label: string; parts: { key: string; label: string; max: number; score: number; hint: string }[] }
export interface CardT {
  design: string; last4: string; expiry: string; masked: string; frozen: boolean; parentLocked: boolean; onlineEnabled: boolean; instoreEnabled: boolean;
  internationalEnabled: boolean; notifyTxn: boolean; perTxnLimit: number; dailyLimit: number; monthlyLimit: number; blockedCategories: string[]; approvalThreshold: number; usage: { today: number; month: number };
}
export interface Insight { id: string; tone: 'good' | 'warn' | 'info'; emoji: string; title: string; body: string }

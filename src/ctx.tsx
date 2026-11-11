import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api, ApiError, errMsg, type BadgeT, type Me } from './api';
import { Sheet, Button, PinInput } from './ui';

// ---------- toasts ----------
type Toast = { id: number; kind: 'ok' | 'error' | 'reward'; text: string; sub?: string; emoji?: string };
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const [burst, setBurst] = useState(0);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { ...t, id }]);
    if (t.kind === 'reward') setBurst((b) => b + 1);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.kind === 'error' ? 5000 : 3600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'ok' ? '' : t.kind}`}>
            {t.emoji ? <span style={{ fontSize: 22 }}>{t.emoji}</span> : t.kind === 'error' ? <TriangleAlert size={20} color="var(--danger)" /> : <Check size={20} color="var(--green)" />}
            <div className="grow"><div>{t.text}</div>{t.sub && <div className="small muted">{t.sub}</div>}</div>
          </div>
        ))}
      </div>
      {burst > 0 && <Confetti key={burst} />}
    </ToastCtx.Provider>
  );
}

function Confetti() {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setTimeout(() => setOn(false), 2600); return () => clearTimeout(t); }, []);
  const bits = useMemo(() => Array.from({ length: 44 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 0.5, dur: 1.4 + Math.random() * 1.1, color: ['#39ff9c', '#a78bfa', '#facc15', '#f472b6', '#38bdf8'][i % 5] })), []);
  if (!on) return null;
  return <div className="confetti" aria-hidden>{bits.map((b, i) => <i key={i} style={{ left: `${b.left}%`, background: b.color, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s` }} />)}</div>;
}

// ---------- auth ----------
interface AuthState { user: Me | null; loading: boolean; error: unknown; refresh: () => Promise<unknown>; setUser: (u: Me | null) => void; logout: () => Promise<void> }
const AuthCtx = createContext<AuthState>(null as never);
export const useAuth = () => useContext(AuthCtx);
/** For screens rendered behind an auth guard. */
export const useMe = () => useContext(AuthCtx).user!;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api<{ user: Me | null }>('/me')).user,
    refetchInterval: 45000,
  });
  const setUser = useCallback((u: Me | null) => { qc.setQueryData(['me'], u); }, [qc]);
  const logout = useCallback(async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); qc.clear(); qc.setQueryData(['me'], null); }, [qc]);
  const value = useMemo(() => ({ user: q.data ?? null, loading: q.isLoading, error: q.error, refresh: () => q.refetch(), setUser, logout }), [q.data, q.isLoading, q.error, q.refetch, setUser, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/** Call after any mutation: updates the cached user, announces new badges, refreshes dependent data. */
export function useAfter() {
  const qc = useQueryClient();
  const { setUser } = useAuth();
  const toast = useToast();
  return useCallback((res?: { user?: Me; badges?: BadgeT[]; reward?: { xp: number; leveledUp?: boolean; level?: number; title?: string } | null }) => {
    if (res?.user) setUser(res.user);
    res?.badges?.forEach((b) => toast({ kind: 'reward', emoji: b.emoji, text: `Badge unlocked: ${b.name}`, sub: b.desc }));
    if (res?.reward?.leveledUp) toast({ kind: 'reward', emoji: '⚡', text: `Level ${res.reward.level}: ${res.reward.title}`, sub: 'You levelled up!' });
    qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    if (!res?.user) qc.invalidateQueries({ queryKey: ['me'] });
  }, [qc, setUser, toast]);
}

// ---------- PIN gate ----------
type PinJob = { title: string; run: (pin: string) => Promise<unknown>; resolve: (v: any) => void; reject: (e: unknown) => void };
const PinCtx = createContext<<T>(title: string, run: (pin: string) => Promise<T>) => Promise<T>>(null as never);
/** withPin('Confirm payment', pin => api(...)) — asks for the PIN (or sets one first), retries on a wrong PIN. */
export const usePin = () => useContext(PinCtx);
export class Cancelled extends Error { constructor() { super('Cancelled'); } }

export function PinProvider({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();
  const [job, setJob] = useState<PinJob | null>(null);
  const [pin, setPin] = useState('');
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const jobRef = useRef<PinJob | null>(null);
  jobRef.current = job;
  const needsSetup = !!user && !user.hasPin;

  const withPin = useCallback(<T,>(title: string, run: (pin: string) => Promise<T>) =>
    new Promise<T>((resolve, reject) => { setPin(''); setFirst(''); setError(''); setJob({ title, run, resolve, reject }); }), []);

  const close = () => { jobRef.current?.reject(new Cancelled()); setJob(null); };

  async function submit(value: string) {
    const j = jobRef.current;
    if (!j || busy) return;
    setError('');
    if (needsSetup) {
      if (!first) { setFirst(value); setPin(''); return; }
      if (first !== value) { setFirst(''); setPin(''); setError("PINs didn't match. Start again."); return; }
      setBusy(true);
      try { const r = await api<{ user: Me }>('/me/pin', { body: { pin: value } }); setUser(r.user); }
      catch (e) { setBusy(false); setFirst(''); setPin(''); setError(errMsg(e)); return; }
    }
    setBusy(true);
    try { const out = await j.run(value); setJob(null); j.resolve(out); }
    catch (e) {
      if (e instanceof ApiError && (e.code === 'PIN_INVALID' || e.code === 'PIN_LOCKED')) { setPin(''); setError(e.message); }
      else { setJob(null); j.reject(e); }
    } finally { setBusy(false); }
  }

  return (
    <PinCtx.Provider value={withPin}>
      {children}
      {job && (
        <Sheet title={needsSetup ? (first ? 'Confirm your new PIN' : 'Create your LevelUp PIN') : job.title} onClose={close}>
          <div className="col" style={{ alignItems: 'center', gap: 16, textAlign: 'center' }}>
            <div className="ico-sq in" style={{ width: 52, height: 52, borderRadius: 18 }}><ShieldCheck size={26} /></div>
            <p className="t2 small" style={{ maxWidth: 300 }}>
              {needsSetup ? 'Your 4-digit PIN protects payments and card details. Pick one only you know.' : 'Enter your 4-digit LevelUp PIN to continue.'}
            </p>
            <PinInput value={pin} onChange={(v) => { setPin(v); if (v.length === 4) submit(v); }} error={!!error} disabled={busy} />
            <div className="error-text" role="alert" style={{ minHeight: 20 }}>{error}</div>
            {user?.isDemo && !needsSetup && <p className="hint">Demo account PIN: <b className="t2">1234</b></p>}
            <Button variant="ghost" block onClick={close}>Cancel</Button>
          </div>
        </Sheet>
      )}
    </PinCtx.Provider>
  );
}

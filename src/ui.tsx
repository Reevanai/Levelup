import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, Info, RefreshCw, X } from 'lucide-react';
import { type Txn, errMsg } from './api';
import { dayLabel, fmtTime, inr, txnVisual } from './lib';
import { useAuth } from './ctx';

export function Button({ variant = 'primary', size, block, loading, children, className = '', ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'purple' | 'ghost' | 'danger'; size?: 'sm'; block?: boolean; loading?: boolean }) {
  return (
    <button type="button" {...p} disabled={p.disabled || loading} aria-busy={loading || undefined} className={`btn ${variant} ${size ?? ''} ${block ? 'block' : ''} ${className}`}>
      {loading ? <span className="spinner" aria-label="Working" /> : children}
    </button>
  );
}

export function Field({ label, hint, error, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" aria-invalid={!!error} aria-describedby={error || hint ? `${id}-d` : undefined} {...p} />
      {(error || hint) && <div id={`${id}-d`} className={error ? 'error-text' : 'hint'}>{error || hint}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="toggle" onClick={() => onChange(!checked)} />;
}

export function Tabs<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

/** Bottom sheet on phones, centred dialog on wider screens. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    (el.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]), select, textarea') ?? el).focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); }
      if (e.key === 'Tab') {
        const f = [...el.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select, textarea, [tabindex="0"]')];
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    el.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { el.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.({ preventScroll: true }); };
  }, []);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <div className="grab" />
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function PinInput({ value, onChange, error, disabled }: { value: string; onChange: (v: string) => void; error?: boolean; disabled?: boolean }) {
  return (
    <div className={`pin ${error ? 'shake' : ''}`} key={error ? 'e' : 'n'}>
      {[0, 1, 2, 3].map((i) => <i key={i} className={value.length > i ? 'on' : value.length === i ? 'cur' : ''}>{value.length > i ? '●' : ''}</i>)}
      <input data-autofocus aria-label="4-digit PIN" inputMode="numeric" autoComplete="off" type="password" maxLength={4} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))} />
    </div>
  );
}

export function AmountInput({ value, onChange, presets = [100, 500, 1000, 2000], label = 'Amount in rupees' }: { value: string; onChange: (v: string) => void; presets?: number[]; label?: string }) {
  return (
    <div>
      <div className="amount">
        <span aria-hidden>₹</span>
        <input data-autofocus aria-label={label} inputMode="decimal" placeholder="0" value={value} style={{ width: `${Math.max(2, value.length + 0.5)}ch` }}
          onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ''); if (/^\d{0,7}(\.\d{0,2})?$/.test(v)) onChange(v); }} />
      </div>
      <div className="chips" style={{ justifyContent: 'center' }}>
        {presets.map((p) => <button type="button" key={p} className="chip" onClick={() => onChange(String(p))}>₹{p.toLocaleString('en-IN')}</button>)}
      </div>
    </div>
  );
}

export function Bar({ value, tone = '', label }: { value: number; tone?: '' | 'green' | 'warn' | 'red'; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return <div className={`bar ${tone}`} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}><i style={{ width: `${v}%` }} /></div>;
}

export function Ring({ value, size = 64, stroke = 7, color = 'var(--green)', children, label }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode; label?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const [v, setV] = useState(0);
  useEffect(() => { const t = requestAnimationFrame(() => setV(Math.max(0, Math.min(1, value)))); return () => cancelAnimationFrame(t); }, [value]);
  return (
    <div style={{ width: size, height: size, position: 'relative', display: 'grid', placeItems: 'center', flex: 'none' }} role="img" aria-label={label ?? `${Math.round(value * 100)}%`}>
      <svg className="ring" width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.09)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
      </svg>
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

export const Skeleton = ({ h = 80, w = '100%', r }: { h?: number; w?: number | string; r?: number }) => <div className="skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
export const PageSkeleton = () => <div className="stack" aria-busy="true" aria-label="Loading"><Skeleton h={170} r={26} /><Skeleton h={90} r={26} /><Skeleton h={220} r={26} /></div>;

export function Empty({ emoji, title, body, action }: { emoji: string; title: string; body?: string; action?: ReactNode }) {
  return <div className="state"><div className="big" aria-hidden>{emoji}</div><h3>{title}</h3>{body && <p className="muted small" style={{ maxWidth: 320 }}>{body}</p>}{action}</div>;
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="card state" role="alert">
      <div className="big" aria-hidden>🛰️</div><h3>That didn't load</h3><p className="muted small">{errMsg(error)}</p>
      {retry && <Button variant="ghost" size="sm" onClick={retry}><RefreshCw size={15} /> Try again</Button>}
    </div>
  );
}
/** Standard loading / error / data switch for a query. */
export function Load<T>({ q, children, skeleton }: { q: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown }; children: (d: T) => ReactNode; skeleton?: ReactNode }) {
  if (q.data !== undefined) return <>{children(q.data)}</>;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return <>{skeleton ?? <PageSkeleton />}</>;
}

export function Money({ value, sign, className = '' }: { value: number; sign?: boolean; className?: string }) {
  return <span className={`num ${className}`}>{inr(value, { sign })}</span>;
}
/** Balance that respects the "hide balance" privacy setting. */
export function Private({ value }: { value: number }) {
  const { user } = useAuth();
  return user?.settings.hideBalance ? <span className="num" aria-label="Balance hidden">₹ ••••</span> : <Money value={value} />;
}

export function TxnRow({ t, to }: { t: Txn; to?: string }) {
  const v = txnVisual(t);
  const credit = t.direction === 'credit', failed = t.status !== 'success';
  return (
    <Link className="item" to={to ?? `/app/txn/${t.id}`}>
      <div className="avatar" aria-hidden>{v.emoji}</div>
      <div className="grow">
        <div className="truncate" style={{ fontWeight: 650 }}>{t.title}</div>
        <div className="small muted truncate">{failed ? 'Declined' : t.subtitle ?? v.label} · {dayLabel(t.createdAt)}, {fmtTime(t.createdAt)}</div>
      </div>
      <div className="num" style={{ fontWeight: 650, color: failed ? 'var(--muted)' : credit ? 'var(--green)' : 'var(--text)', textDecoration: failed ? 'line-through' : undefined }}>
        {credit ? '+' : '−'}{inr(t.amount)}
      </div>
    </Link>
  );
}

export function DirIcon({ credit }: { credit: boolean }) {
  return <div className={`ico-sq ${credit ? 'in' : 'out'}`} aria-hidden>{credit ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}</div>;
}

export function PageHead({ title, back, right, sub }: { title: string; back?: string; right?: ReactNode; sub?: string }) {
  return (
    <div className="topbar">
      <div className="row grow">
        {back && <Link to={back} className="icon-btn no-print" aria-label="Back"><ChevronLeft size={22} /></Link>}
        <div className="grow"><h1 className="truncate">{title}</h1>{sub && <p className="muted small">{sub}</p>}</div>
      </div>
      {right}
    </div>
  );
}

export function SimNotice({ children }: { children?: ReactNode }) {
  return <div className="notice"><Info size={16} /><span>{children ?? 'Prototype: this is simulated money. No real funds move and nothing is charged.'}</span></div>;
}

export function Success({ title, body, pending, children }: { title: string; body?: ReactNode; pending?: boolean; children?: ReactNode }) {
  return (
    <div className="col" style={{ textAlign: 'center', alignItems: 'stretch', gap: 14 }} role="status">
      <div className={`success ${pending ? 'pending' : ''}`} aria-hidden>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">{pending ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> : <path d="M5 12.5l4.5 4.5L19 7.5" />}</svg>
      </div>
      <h2>{title}</h2>
      {body && <p className="t2">{body}</p>}
      {children}
    </div>
  );
}

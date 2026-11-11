import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { api, ApiError, errMsg, type Me } from '../api';
import { useAuth, useToast } from '../ctx';
import { Button, Field } from '../ui';
import { Brand } from '../shell';

const DEMOS = [
  { role: 'Teen', name: 'Aarav, 17', email: 'aarav@levelup.demo', emoji: '🦊' },
  { role: 'Parent', name: 'Priya', email: 'priya@levelup.demo', emoji: '🦉' },
];

export function DemoButtons() {
  const { setUser } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  async function enter(email: string) {
    setBusy(email);
    try { setUser((await api<{ user: Me }>('/auth/login', { body: { email, password: 'demo1234' } })).user); }
    catch (e) { toast({ kind: 'error', text: errMsg(e) }); }
    finally { setBusy(''); }
  }
  return (
    <div className="grid2">
      {DEMOS.map((d) => (
        <button key={d.email} type="button" className="card tight press row" onClick={() => enter(d.email)} disabled={!!busy} aria-label={`Open the ${d.role} demo account`}>
          <span className="avatar sm" aria-hidden>{busy === d.email ? <span className="spinner" /> : d.emoji}</span>
          <span><span style={{ display: 'block', fontWeight: 700 }}>{d.role} demo</span><span className="tiny muted">{d.name}</span></span>
        </button>
      ))}
    </div>
  );
}

function PasswordField({ value, onChange, label = 'Password', hint, autoComplete }: { value: string; onChange: (v: string) => void; label?: string; hint?: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <Field label={label} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required hint={hint} style={{ paddingRight: 52 }} />
      <button type="button" className="icon-btn" style={{ position: 'absolute', right: 4, top: 29, background: 'none', border: 0 }} aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export function Login() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const { user } = await api<{ user: Me }>('/auth/login', { body: { email, password } });
      setUser(user);
      if (from && from.startsWith(user.role === 'parent' ? '/parent' : '/app')) nav(from, { replace: true });
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <div className="auth page">
      <div className="auth-card col" style={{ gap: 20 }}>
        <Brand />
        <div><h1>Welcome back</h1><p className="muted" style={{ marginTop: 6 }}>Sign in to pick up your streak.</p></div>
        <form className="card col" style={{ gap: 14 }} onSubmit={submit} noValidate>
          <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required autoFocus />
          <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
          {error && <div className="error-text" role="alert">{error}</div>}
          <Button type="submit" block loading={busy} disabled={!email || !password}>Sign in</Button>
        </form>
        <div className="card tight col"><div className="up">Or explore a demo account</div><DemoButtons /></div>
        <p className="small muted" style={{ textAlign: 'center' }}>New here? <Link className="link" to="/register">Create an account</Link></p>
      </div>
    </div>
  );
}

export function Register() {
  const { setUser } = useAuth();
  const [role, setRole] = useState<'teen' | 'parent'>('teen');
  const [f, setF] = useState({ name: '', email: '', password: '', dob: '', familyCode: '' });
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null); setBusy(true);
    try {
      const body = { role, name: f.name, email: f.email, password: f.password, ...(role === 'teen' ? { dob: f.dob || undefined } : { familyCode: f.familyCode || undefined }) };
      setUser((await api<{ user: Me }>('/auth/register', { body })).user);
    } catch (e) { setError({ field: e instanceof ApiError ? (e.data.field as string) : undefined, message: errMsg(e) }); } finally { setBusy(false); }
  }
  const err = (k: string) => (error?.field === k ? error.message : undefined);
  return (
    <div className="auth page">
      <div className="auth-card col" style={{ gap: 20 }}>
        <Brand />
        <div><h1>Create your account</h1><p className="muted" style={{ marginTop: 6 }}>Two minutes. No real money needed.</p></div>
        <form className="card col" style={{ gap: 14 }} onSubmit={submit} noValidate>
          <div className="field">
            <span className="label" id="who">I am a…</span>
            <div className="grid2" role="group" aria-labelledby="who">
              {(['teen', 'parent'] as const).map((r) => (
                <button key={r} type="button" className={`card tight press ${role === r ? 'glow' : ''}`} aria-pressed={role === r} onClick={() => setRole(r)}>
                  <div style={{ fontSize: 24 }} aria-hidden>{r === 'teen' ? '🦊' : '🦉'}</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{r === 'teen' ? 'Teen / young adult' : 'Parent'}</div>
                  <div className="tiny muted">{r === 'teen' ? 'Spend, save, level up' : 'Guide and support'}</div>
                </button>
              ))}
            </div>
          </div>
          <Field label="Full name" value={f.name} onChange={set('name')} autoComplete="name" required error={err('name')} />
          <Field label="Email" type="email" value={f.email} onChange={set('email')} autoComplete="email" inputMode="email" required error={err('email')} />
          <PasswordField value={f.password} onChange={(v) => setF({ ...f, password: v })} autoComplete="new-password" hint={err('password') ?? 'At least 8 characters.'} />
          {role === 'teen'
            ? <Field label="Date of birth" type="date" value={f.dob} onChange={set('dob')} max={new Date().toISOString().slice(0, 10)} required error={err('dob')} hint="LevelUp is for ages 13 and up." />
            : <Field label="Child's family code (optional)" value={f.familyCode} onChange={set('familyCode')} placeholder="e.g. K7M2QX" autoCapitalize="characters" hint="Your child finds this in their Profile. You can also link later." />}
          {error && !['name', 'email', 'dob'].includes(error.field ?? '') && <div className="error-text" role="alert">{error.message}</div>}
          <Button type="submit" block loading={busy} disabled={!f.name || !f.email || !f.password}>Create account</Button>
          <p className="tiny muted">By continuing you understand this is a prototype with simulated money. Please don't enter real financial or identity details.</p>
        </form>
        <p className="small muted" style={{ textAlign: 'center' }}>Already have an account? <Link className="link" to="/login">Sign in</Link></p>
      </div>
    </div>
  );
}

import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Bell, ChevronRight, Copy, KeyRound, LogOut, PiggyBank, Settings as Cog, ShieldCheck, Sparkles, Smartphone, Users } from 'lucide-react';
import { api, errMsg, type Me } from '../api';
import { useAfter, useAuth, useMe, useToast } from '../ctx';
import { Bar, Button, Empty, Field, Load, PageHead, PinInput, Sheet, Success, Toggle } from '../ui';
import { ago, fmtDate, inr } from '../lib';
import { DISCLAIMER } from '../../shared/constants';

const baseFor = (me: Me) => (me.role === 'parent' ? '/parent' : '/app');
const Row = ({ to, icon, title, sub, right }: { to: string; icon: ReactNode; title: string; sub?: string; right?: ReactNode }) => (
  <Link to={to} className="item"><div className="ico-sq">{icon}</div><div className="grow"><div style={{ fontWeight: 650 }}>{title}</div>{sub && <div className="small muted">{sub}</div>}</div>{right}<ChevronRight size={18} className="muted" /></Link>
);

export function Profile() {
  const me = useMe(); const { logout, setUser } = useAuth(); const toast = useToast(); const nav = useNavigate();
  const [edit, setEdit] = useState<null | 'profile' | 'plan'>(null);
  const [name, setName] = useState(me.name); const [avatar, setAvatar] = useState(me.avatar);
  const [budget, setBudget] = useState(me.monthlyBudget / 100); const [target, setTarget] = useState(me.savingsTarget / 100);
  const [busy, setBusy] = useState(false);
  async function save(body: object) {
    setBusy(true);
    try { setUser((await api<{ user: Me }>('/me', { method: 'PATCH', body })).user); setEdit(null); toast({ kind: 'ok', text: 'Saved' }); }
    catch (e) { toast({ kind: 'error', text: errMsg(e) }); } finally { setBusy(false); }
  }
  const verified = me.kycStatus === 'demo_verified';
  return (
    <div className="page">
      <PageHead title="Profile" right={<Link to="/app/settings" className="icon-btn" aria-label="Settings"><Cog size={20} /></Link>} />
      <div className="cols">
        <div className="stack">
          <section className="card glow">
            <div className="row" style={{ gap: 16 }}>
              <span className="avatar lg" aria-hidden>{me.avatar}</span>
              <div className="grow"><h2 className="truncate">{me.name}</h2><div className="small t2 truncate">{me.handle}</div>
                <div className="row wrap" style={{ gap: 6, marginTop: 8 }}><span className="badge-pill purple">Level {me.level.level} · {me.level.title}</span>{verified && <span className="badge-pill green"><BadgeCheck size={12} /> Demo verified</span>}</div></div>
            </div>
            <div style={{ marginTop: 14 }}><Bar value={me.level.progress * 100} label="Level progress" /><div className="tiny muted" style={{ marginTop: 6 }}>{me.level.xp.toLocaleString('en-IN')} XP · {me.level.toNext} to next level</div></div>
            <Button variant="ghost" size="sm" style={{ marginTop: 12 }} onClick={() => { setName(me.name); setAvatar(me.avatar); setEdit('profile'); }}>Edit profile</Button>
          </section>

          <section className="card" aria-labelledby="p-plan">
            <div className="section-head"><h3 id="p-plan">Your game plan</h3><button className="link" onClick={() => { setBudget(me.monthlyBudget / 100); setTarget(me.savingsTarget / 100); setEdit('plan'); }}>Edit</button></div>
            <div className="grid2"><div className="stat"><span className="small muted">Monthly budget</span><b>{inr(me.monthlyBudget)}</b></div><div className="stat"><span className="small muted">Savings target</span><b className="green">{inr(me.savingsTarget)}</b></div></div>
          </section>

          <section className="card" aria-labelledby="p-fam">
            <div className="section-head"><h3 id="p-fam">Family</h3></div>
            {me.parent ? <div className="row"><span className="avatar" aria-hidden>{me.parent.avatar}</span><div className="grow"><div style={{ fontWeight: 650 }}>{me.parent.name}</div><div className="small muted">Linked parent · can send allowance and set controls</div></div><span className="badge-pill green">Linked</span></div>
              : <div className="col"><p className="small t2">Share this code with a parent. They enter it when they sign up to link your accounts.</p>
                <button className="card tight row between" onClick={() => { navigator.clipboard?.writeText(me.familyCode ?? ''); toast({ kind: 'ok', text: 'Family code copied' }); }} aria-label={`Copy family code ${me.familyCode}`}>
                  <span className="num" style={{ fontSize: 24, letterSpacing: '.18em', fontWeight: 700 }}>{me.familyCode}</span><Copy size={18} /></button></div>}
          </section>
        </div>

        <div className="stack">
          <section className="card"><div className="list">
            <Row to="/app/vaults" icon={<PiggyBank size={18} />} title="Savings vaults" sub="Goals and deposit history" />
            <Row to="/app/assistant" icon={<Sparkles size={18} />} title="Money coach" sub="Insights, reports and quizzes" />
            <Row to="/app/notifications" icon={<Bell size={18} />} title="Notifications" right={me.unread > 0 ? <span className="badge-pill green">{me.unread} new</span> : undefined} />
            <Row to="/app/kyc" icon={<BadgeCheck size={18} />} title="Identity verification" sub="Demonstration only" right={<span className={`badge-pill ${verified ? 'green' : 'warn'}`}>{verified ? 'Done' : 'Not started'}</span>} />
            <Row to="/app/settings" icon={<ShieldCheck size={18} />} title="Settings and security" sub="PIN, password, devices" />
          </div></section>
          <Button variant="danger" block onClick={async () => { await logout(); nav('/'); }}><LogOut size={17} /> Sign out</Button>
          <p className="tiny muted" style={{ textAlign: 'center' }}>{DISCLAIMER}<br />Member since {fmtDate(me.createdAt)} · v0.1 prototype</p>
        </div>
      </div>

      {edit === 'profile' && (
        <Sheet title="Edit profile" onClose={() => setEdit(null)}>
          <form className="col" style={{ gap: 14 }} onSubmit={(e: FormEvent) => { e.preventDefault(); save({ name, avatar }); }}>
            <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
            <div className="field"><span className="label">Avatar</span><div className="chips" role="group" aria-label="Avatar">{['🦊', '🐯', '🐼', '🦄', '🐺', '🦋', '🐙', '🦅', '🐸', '🦁', '🐨', '👾'].map((a) => <button type="button" key={a} className="chip" style={{ fontSize: 20, padding: '0 10px' }} aria-pressed={avatar === a} aria-label={`Avatar ${a}`} onClick={() => setAvatar(a)}>{a}</button>)}</div></div>
            <Button type="submit" block loading={busy} disabled={name.trim().length < 2}>Save</Button>
          </form>
        </Sheet>
      )}
      {edit === 'plan' && (
        <Sheet title="Your game plan" onClose={() => setEdit(null)}>
          <form className="col" style={{ gap: 18 }} onSubmit={(e: FormEvent) => { e.preventDefault(); save({ monthlyBudget: budget * 100, savingsTarget: target * 100 }); }}>
            <div className="field"><div className="row between"><label htmlFor="pb">Monthly spending budget</label><b className="num">{inr(budget * 100)}</b></div><input id="pb" type="range" min={1000} max={30000} step={500} value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></div>
            <div className="field"><div className="row between"><label htmlFor="pt">Monthly savings target</label><b className="num green">{inr(target * 100)}</b></div><input id="pt" type="range" min={200} max={15000} step={100} value={target} onChange={(e) => setTarget(Number(e.target.value))} /></div>
            <p className="hint">Your weekly spending mission uses a quarter of your monthly budget ({inr(budget * 25)}).</p>
            <Button type="submit" block loading={busy}>Save plan</Button>
          </form>
        </Sheet>
      )}
    </div>
  );
}

export function Settings() {
  const me = useMe(); const { setUser, logout } = useAuth(); const toast = useToast(); const nav = useNavigate();
  const base = baseFor(me);
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<{ sessions: { id: string; userAgent: string; createdAt: number; current: boolean }[] }>('/me/sessions') });
  const [sheet, setSheet] = useState<null | 'password' | 'pin'>(null);
  const [f, setF] = useState({ current: '', next: '', pin: '', password: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [ok, setOk] = useState(false);
  const open = (s: 'password' | 'pin') => { setF({ current: '', next: '', pin: '', password: '' }); setError(''); setOk(false); setSheet(s); };
  const setPref = async (k: string, v: boolean) => { try { setUser((await api<{ user: Me }>('/me', { method: 'PATCH', body: { settings: { [k]: v } } })).user); } catch (e) { toast({ kind: 'error', text: errMsg(e) }); } };
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (sheet === 'password') await api('/me/password', { body: { current: f.current, next: f.next } });
      else setUser((await api<{ user: Me }>('/me/pin', { body: { pin: f.pin, password: f.password || undefined } })).user);
      setOk(true); sessions.refetch();
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  const pref = (k: string, dflt = true) => me.settings[k] ?? dflt;
  const device = (ua: string) => (/iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Android/.test(ua) ? 'Android phone' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : /Linux/.test(ua) ? 'Linux device' : 'Unknown device') + (/Chrome/.test(ua) ? ' · Chrome' : /Safari/.test(ua) ? ' · Safari' : /Firefox/.test(ua) ? ' · Firefox' : '');

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <PageHead title="Settings" back={me.role === 'parent' ? '/parent' : '/app/profile'} />
      <div className="stack">
        <section className="card" aria-labelledby="s-sec"><div className="section-head"><h3 id="s-sec">Security</h3></div>
          <div className="list">
            <button className="item" onClick={() => open('password')}><div className="ico-sq"><KeyRound size={18} /></div><div className="grow"><div style={{ fontWeight: 650 }}>Change password</div><div className="small muted">Signs out your other devices</div></div><ChevronRight size={18} className="muted" /></button>
            {me.role === 'teen' && <button className="item" onClick={() => open('pin')}><div className="ico-sq"><ShieldCheck size={18} /></div><div className="grow"><div style={{ fontWeight: 650 }}>{me.hasPin ? 'Change LevelUp PIN' : 'Set LevelUp PIN'}</div><div className="small muted">Used for payments and card details</div></div><span className={`badge-pill ${me.hasPin ? 'green' : 'warn'}`}>{me.hasPin ? 'Set' : 'Not set'}</span></button>}
            <div className="item"><div className="ico-sq"><Smartphone size={18} /></div><div className="grow"><div style={{ fontWeight: 650 }}>Biometric unlock</div><div className="small muted">Preference only in this web prototype</div></div><Toggle checked={pref('biometric', false)} onChange={(v) => setPref('biometric', v)} label="Biometric unlock" /></div>
            {me.role === 'teen' && <div className="item"><div className="ico-sq">🙈</div><div className="grow"><div style={{ fontWeight: 650 }}>Hide balances</div><div className="small muted">Mask amounts on Home and Wallet</div></div><Toggle checked={pref('hideBalance', false)} onChange={(v) => setPref('hideBalance', v)} label="Hide balances" /></div>}
          </div>
        </section>

        <section className="card" aria-labelledby="s-not"><div className="section-head"><h3 id="s-not">Notifications</h3></div>
          <div className="list">
            {([['notifyPush', 'Payment alerts', 'Every payment, top-up and request'], ['notifyRewards', 'Rewards and streaks', 'Missions, badges and level-ups'], ['notifyEmail', 'Monthly report email', 'A summary at the start of each month']] as const).map(([k, t, s]) => (
              <div className="item" key={k}><div className="ico-sq"><Bell size={18} /></div><div className="grow"><div style={{ fontWeight: 650 }}>{t}</div><div className="small muted">{s}</div></div><Toggle checked={pref(k)} onChange={(v) => setPref(k, v)} label={t} /></div>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>The prototype shows alerts in-app only. No emails or push messages are sent.</p>
        </section>

        <section className="card" aria-labelledby="s-dev"><div className="section-head"><h3 id="s-dev">Signed-in devices</h3></div>
          <Load q={sessions} skeleton={<div className="skel" style={{ height: 60 }} />}>{(d) => (<>
            <div className="list">{d.sessions.map((s) => (
              <div className="item" key={s.id}><div className="ico-sq"><Smartphone size={18} /></div><div className="grow"><div style={{ fontWeight: 650 }}>{device(s.userAgent)}</div><div className="small muted">Signed in {ago(s.createdAt)}</div></div>{s.current && <span className="badge-pill green">This device</span>}</div>))}</div>
            {d.sessions.length > 1 && <Button variant="ghost" size="sm" style={{ marginTop: 10 }} onClick={async () => { try { const r = await api<{ revoked: number }>('/me/sessions/revoke-others', { method: 'POST' }); toast({ kind: 'ok', text: `Signed out ${r.revoked} other device${r.revoked === 1 ? '' : 's'}` }); sessions.refetch(); } catch (e) { toast({ kind: 'error', text: errMsg(e) }); } }}>Sign out other devices</Button>}
          </>)}</Load>
        </section>

        <section className="card" aria-labelledby="s-about"><div className="section-head"><h3 id="s-about">About this prototype</h3></div>
          <ul className="small t2" style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>LevelUp is not a bank and holds no deposits. Every balance and payment here is simulated.</li>
            <li>The card is a demo with a number that cannot be issued or charged.</li>
            <li>Identity verification is a walkthrough. No documents are collected or checked.</li>
            <li>A live product would deliver these services through licensed banking, prepaid instrument, payment and KYC partners.</li>
          </ul>
        </section>
        <div className="row">{me.role === 'parent' && <Link to="/parent" className="btn ghost grow"><Users size={17} /> Dashboard</Link>}<Button variant="danger" className="grow" onClick={async () => { await logout(); nav('/'); }}><LogOut size={17} /> Sign out</Button></div>
        <p className="tiny muted" style={{ textAlign: 'center' }}>Signed in as {me.email}{me.isDemo ? ' · demo account' : ''} · <Link className="link" to={base}>Back to app</Link></p>
      </div>

      {sheet && (
        <Sheet title={sheet === 'password' ? 'Change password' : me.hasPin ? 'Change PIN' : 'Set PIN'} onClose={() => setSheet(null)}>
          {ok ? <Success title={sheet === 'password' ? 'Password updated' : 'PIN saved'} body={sheet === 'password' ? 'Your other devices have been signed out.' : 'Use it to approve payments.'}><Button block onClick={() => setSheet(null)}>Done</Button></Success> : (
            <form className="col" style={{ gap: 14 }} onSubmit={submit}>
              {sheet === 'password' ? <>
                <Field label="Current password" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required />
                <Field label="New password" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} hint="At least 8 characters." required />
              </> : <>
                <div className="col" style={{ alignItems: 'center', gap: 8 }}><span className="label">New 4-digit PIN</span><PinInput value={f.pin} onChange={(pin) => setF({ ...f, pin })} /></div>
                {me.hasPin && <Field label="Account password" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} hint="Needed to change an existing PIN." required />}
              </>}
              {error && <div className="error-text" role="alert">{error}</div>}
              <Button type="submit" block loading={busy} disabled={sheet === 'password' ? !f.current || f.next.length < 8 : f.pin.length < 4 || (me.hasPin && !f.password)}>Save</Button>
            </form>
          )}
        </Sheet>
      )}
    </div>
  );
}

const NOTIF_EMOJI: Record<string, string> = { txn: '💸', reward: '🏆', approval: '📨', security: '🛡️', system: '⚡', insight: '🧠', child_spend: '🧾', child_save: '🌱' };

export function Notifications() {
  const me = useMe(); const after = useAfter(); const nav = useNavigate();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ notifications: { id: string; type: string; title: string; body: string; link: string | null; read: boolean; createdAt: number }[] }>('/me/notifications'), refetchInterval: 30000 });
  const mark = async (id?: string) => { await api('/me/notifications/read', { body: id ? { id } : {} }).catch(() => {}); after(); };
  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <PageHead title="Notifications" back={baseFor(me)} right={q.data?.notifications.some((n) => !n.read) ? <Button size="sm" variant="ghost" onClick={() => mark()}>Mark all read</Button> : undefined} />
      <Load q={q}>{(d) => d.notifications.length === 0 ? <div className="card"><Empty emoji="🔔" title="You're all caught up" body="Payment alerts, rewards and approvals will show up here." /></div> : (
        <div className="card"><div className="list">
          {d.notifications.map((n) => (
            <button key={n.id} className="item" style={{ alignItems: 'flex-start' }} onClick={async () => { if (!n.read) await mark(n.id); if (n.link) nav(n.link); }} aria-label={`${n.read ? '' : 'Unread: '}${n.title}. ${n.body}`}>
              <span className="avatar" aria-hidden>{NOTIF_EMOJI[n.type] ?? '🔔'}</span>
              <span className="grow"><span style={{ display: 'block', fontWeight: n.read ? 600 : 750, color: n.read ? 'var(--text-2)' : undefined }}>{n.title}</span><span className="small muted" style={{ display: 'block' }}>{n.body}</span><span className="tiny muted">{ago(n.createdAt)}</span></span>
              {!n.read && <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--green)', marginTop: 8, flex: 'none' }} aria-hidden />}
            </button>
          ))}
        </div></div>
      )}</Load>
    </div>
  );
}

/** A walkthrough of what verification would feel like. It collects nothing. */
export function Kyc() {
  const me = useMe(); const after = useAfter(); const toast = useToast();
  const [step, setStep] = useState(me.kycStatus === 'demo_verified' ? 3 : 0);
  const [doc, setDoc] = useState<'aadhaar' | 'pan' | 'student_id'>('aadhaar');
  const [busy, setBusy] = useState(false);
  async function finish() {
    setBusy(true);
    try { await new Promise((r) => setTimeout(r, 1400)); after(await api('/me/kyc', { body: { docType: doc } })); setStep(3); }
    catch (e) { toast({ kind: 'error', text: errMsg(e) }); } finally { setBusy(false); }
  }
  const DOCS = [['aadhaar', 'Aadhaar', '🪪'], ['pan', 'PAN card', '💳'], ['student_id', 'Student ID', '🎓']] as const;
  return (
    <div className="page" style={{ maxWidth: 560, margin: '0 auto' }}>
      <PageHead title="Verification" back="/app/profile" />
      <div className="stack">
        <div className="notice"><span><b>Demonstration only.</b> LevelUp does not perform KYC. Nothing you tap here is collected, stored or checked, and you will never be asked to type or upload a real ID. In a live product a licensed partner would run this step.</span></div>
        {step < 3 && <Bar value={((step + 1) / 3) * 100} label="Verification progress" />}
        {step === 0 && <section className="card col page" style={{ gap: 14 }}><div className="up">Step 1 of 3</div><h2>Confirm your details</h2>
          <div className="receipt" style={{ padding: 16 }}><dl><dt>Name</dt><dd>{me.name}</dd><dt>Date of birth</dt><dd>{me.dob ?? 'Not provided'}</dd><dt>Email</dt><dd>{me.email}</dd></dl></div>
          <Button block onClick={() => setStep(1)}>These look right</Button></section>}
        {step === 1 && <section className="card col page" style={{ gap: 14 }}><div className="up">Step 2 of 3</div><h2>Pick a document type</h2><p className="small muted">In the real flow you'd scan it with a verified partner. Here, just pick one.</p>
          <div className="col" role="radiogroup" aria-label="Document type">{DOCS.map(([k, l, e]) => <button key={k} role="radio" aria-checked={doc === k} className={`card tight press row ${doc === k ? 'glow' : ''}`} onClick={() => setDoc(k)}><span className="avatar sm" aria-hidden>{e}</span><span className="grow" style={{ fontWeight: 650 }}>{l}</span>{doc === k && <BadgeCheck size={18} color="var(--green)" />}</button>)}</div>
          <div className="row"><Button variant="ghost" onClick={() => setStep(0)}>Back</Button><Button className="grow" onClick={() => setStep(2)}>Continue</Button></div></section>}
        {step === 2 && <section className="card col page" style={{ gap: 14, textAlign: 'center', alignItems: 'center' }}><div className="up">Step 3 of 3</div><h2>Simulated selfie check</h2>
          <div style={{ width: 150, height: 150, borderRadius: '50%', border: `3px dashed ${busy ? 'var(--green)' : 'var(--line-strong)'}`, display: 'grid', placeItems: 'center', fontSize: 64, animation: busy ? 'spin 2.5s linear infinite' : undefined }} aria-hidden><span style={{ animation: busy ? 'spin 2.5s linear infinite reverse' : undefined }}>{me.avatar}</span></div>
          <p className="small muted">No camera is used. We'll just play the animation.</p>
          <div className="row" style={{ width: '100%' }}><Button variant="ghost" disabled={busy} onClick={() => setStep(1)}>Back</Button><Button className="grow" loading={busy} onClick={finish}>Run demo check</Button></div></section>}
        {step === 3 && <section className="card"><Success title="Demo verification complete" body="This account is marked as demo verified. No identity documents were collected."><Link to="/app/profile" className="btn primary block">Back to profile</Link></Success></section>}
      </div>
    </div>
  );
}

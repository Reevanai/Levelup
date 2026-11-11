import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Lock, Plus, Send, Unlock, X } from 'lucide-react';
import { api, errMsg, type CardT, type Cat, type Health, type Level, type Txn, type Vault } from '../api';
import { useAfter, useMe, useToast } from '../ctx';
import { AmountInput, Bar, Button, Empty, Field, Load, Money, Ring, Sheet, Success, Toggle, TxnRow } from '../ui';
import { Bars, CategoryLegend, Donut, SERIES } from '../charts';
import { ago, fmtDate, inr, pct, toPaise } from '../lib';
import { CATEGORIES } from '../../shared/constants';

interface Child {
  id: string; name: string; avatar: string; handle: string; kycStatus: string; level: Level; streak: number; balance: number; monthSpent: number; monthReceived: number; monthSaved: number;
  weekSpent: number; budget: number; categories: Cat[]; daily: { label: string; spent: number }[]; health: Health; card: CardT; vaults: Vault[]; recent: Txn[];
  allowance: { amount: number; frequency: 'weekly' | 'monthly'; active: boolean; nextRun: number } | null;
}
interface Approval { id: string; childId: string; type: string; title: string; detail: string | null; amount: number; status: string; createdAt: number; resolvedAt: number | null }
interface Overview { children: Child[]; pending: Approval[]; history: Approval[] }
const TYPE_EMOJI: Record<string, string> = { money_request: '🙋', purchase: '🛒', limit_increase: '📈' };

function LinkChild({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const toast = useToast();
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api<{ name: string }>('/parent/children/link', { body: { familyCode: code } }); toast({ kind: 'ok', emoji: '🔗', text: `Linked to ${r.name}` }); setCode(''); onDone(); }
    catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <form className="col" onSubmit={submit} style={{ gap: 12 }}>
      <Field label="Child's family code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. K7M2QX" maxLength={12} autoCapitalize="characters" error={error || undefined} hint="Your child finds this under Profile → Family in their LevelUp app." />
      <Button type="submit" loading={busy} disabled={code.trim().length < 4}>Link account</Button>
    </form>
  );
}

function Controls({ child, onSaved }: { child: Child; onSaved: () => void }) {
  const toast = useToast();
  const c = child.card;
  const [lim, setLim] = useState({ perTxnLimit: c.perTxnLimit / 100, dailyLimit: c.dailyLimit / 100, monthlyLimit: c.monthlyLimit / 100, approvalThreshold: c.approvalThreshold / 100 });
  const [blocked, setBlocked] = useState<string[]>(c.blockedCategories);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setLim({ perTxnLimit: c.perTxnLimit / 100, dailyLimit: c.dailyLimit / 100, monthlyLimit: c.monthlyLimit / 100, approvalThreshold: c.approvalThreshold / 100 }); setBlocked(c.blockedCategories); },
    [c.perTxnLimit, c.dailyLimit, c.monthlyLimit, c.approvalThreshold, c.blockedCategories.join()]);
  const dirty = lim.perTxnLimit * 100 !== c.perTxnLimit || lim.dailyLimit * 100 !== c.dailyLimit || lim.monthlyLimit * 100 !== c.monthlyLimit || lim.approvalThreshold * 100 !== c.approvalThreshold || blocked.slice().sort().join() !== c.blockedCategories.slice().sort().join();
  async function save(body: object, msg: string) {
    setBusy(true);
    try { await api(`/parent/children/${child.id}/controls`, { method: 'PATCH', body }); toast({ kind: 'ok', text: msg }); onSaved(); }
    catch (e) { toast({ kind: 'error', text: errMsg(e) }); } finally { setBusy(false); }
  }
  const slider = (key: keyof typeof lim, label: string, max: number, min = 100, zero?: string) => (
    <div className="col" style={{ gap: 4 }}>
      <div className="row between"><label className="label" htmlFor={`pc-${key}`}>{label}</label><b className="num">{lim[key] === 0 && zero ? zero : inr(lim[key] * 100)}</b></div>
      <input id={`pc-${key}`} type="range" min={min} max={max} step={100} value={lim[key]} onChange={(e) => setLim({ ...lim, [key]: Number(e.target.value) })} aria-valuetext={lim[key] === 0 && zero ? zero : inr(lim[key] * 100)} />
    </div>
  );
  return (
    <section className="card" aria-labelledby="pc-h">
      <div className="section-head"><h3 id="pc-h">Spending controls</h3></div>
      <div className="item" style={{ padding: '4px 0 14px' }}>
        <div className={`ico-sq ${c.parentLocked ? '' : 'in'}`}>{c.parentLocked ? <Lock size={18} /> : <Unlock size={18} />}</div>
        <div className="grow"><div style={{ fontWeight: 650 }}>Lock card and payments</div><div className="small muted">{c.parentLocked ? `${child.name.split(' ')[0]} can't pay or send until you unlock.` : 'Instantly pause all spending.'}</div></div>
        <Toggle checked={c.parentLocked} disabled={busy} onChange={(v) => save({ parentLocked: v }, v ? 'Card locked' : 'Card unlocked')} label="Lock card and payments" />
      </div>
      <div className="col" style={{ gap: 16 }}>
        {slider('perTxnLimit', 'Per-payment limit', 10000)}
        {slider('dailyLimit', 'Daily limit', 15000)}
        {slider('monthlyLimit', 'Monthly limit', 50000)}
        {slider('approvalThreshold', 'Ask me before payments over', 5000, 0, 'Never ask')}
        <div className="field">
          <span className="label" id="pc-b">Blocked categories</span>
          <div className="chips" role="group" aria-labelledby="pc-b">
            {CATEGORIES.map((k) => <button key={k.key} type="button" className="chip" aria-pressed={blocked.includes(k.key)} onClick={() => setBlocked(blocked.includes(k.key) ? blocked.filter((b) => b !== k.key) : [...blocked, k.key])}>{k.emoji} {k.label}</button>)}
          </div>
          <span className="hint">Card payments in a blocked category are declined.</span>
        </div>
        {dirty && <Button loading={busy} onClick={() => save({ perTxnLimit: lim.perTxnLimit * 100, dailyLimit: lim.dailyLimit * 100, monthlyLimit: lim.monthlyLimit * 100, approvalThreshold: lim.approvalThreshold * 100, blockedCategories: blocked }, 'Controls updated')}>Save controls</Button>}
      </div>
    </section>
  );
}

function Allowance({ child, onSaved }: { child: Child; onSaved: () => void }) {
  const toast = useToast();
  const a = child.allowance;
  const [amount, setAmount] = useState(String((a?.amount ?? 150000) / 100)); const [freq, setFreq] = useState<'weekly' | 'monthly'>(a?.frequency ?? 'weekly'); const [active, setActive] = useState(a?.active ?? true);
  const [busy, setBusy] = useState(false);
  const paise = toPaise(amount);
  const dirty = !a || paise !== a.amount || freq !== a.frequency || active !== a.active;
  async function save() {
    setBusy(true);
    try { await api(`/parent/children/${child.id}/allowance`, { method: 'PUT', body: { amount: paise, frequency: freq, active } }); toast({ kind: 'ok', text: active ? 'Allowance scheduled' : 'Allowance paused' }); onSaved(); }
    catch (e) { toast({ kind: 'error', text: errMsg(e) }); } finally { setBusy(false); }
  }
  return (
    <section className="card" aria-labelledby="pa-h">
      <div className="section-head"><h3 id="pa-h">Allowance</h3>{a && <span className={`badge-pill ${a.active ? 'green' : ''}`}>{a.active ? `Next ${fmtDate(a.nextRun)}` : 'Paused'}</span>}</div>
      <div className="col" style={{ gap: 12 }}>
        <div className="grid2">
          <Field label="Amount (₹)" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
          <div className="field"><span className="label" id="pa-f">How often</span><div className="chips" role="group" aria-labelledby="pa-f">
            {(['weekly', 'monthly'] as const).map((f) => <button key={f} type="button" className="chip" aria-pressed={freq === f} onClick={() => setFreq(f)}>{f === 'weekly' ? 'Weekly' : 'Monthly'}</button>)}</div></div>
        </div>
        <div className="row between"><span className="small t2">Send automatically</span><Toggle checked={active} onChange={setActive} label="Send allowance automatically" /></div>
        {dirty && <Button loading={busy} disabled={!paise} onClick={save}>{a ? 'Update allowance' : 'Start allowance'}</Button>}
        <p className="hint">Simulated: allowance is credited to the demo wallet on schedule. No real money leaves your account.</p>
      </div>
    </section>
  );
}

export function Parent() {
  const me = useMe();
  const q = useQuery({ queryKey: ['parent'], queryFn: () => api<Overview>('/parent/overview'), refetchInterval: 20000 });
  const after = useAfter(), toast = useToast();
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState('');
  const [topup, setTopup] = useState(false); const [amount, setAmount] = useState(''); const [note, setNote] = useState(''); const [sent, setSent] = useState(0); const [error, setError] = useState('');
  const [linking, setLinking] = useState(false);

  async function decide(a: Approval, decision: 'approve' | 'decline') {
    setBusy(a.id + decision);
    try { await api(`/parent/approvals/${a.id}`, { body: { decision } }); toast({ kind: 'ok', text: decision === 'approve' ? 'Approved' : 'Declined' }); after(); }
    catch (e) { toast({ kind: 'error', text: errMsg(e) }); } finally { setBusy(''); }
  }

  return (
    <div className="page">
      <Load q={q}>{(d) => {
        if (!d.children.length) return (
          <div className="card" style={{ maxWidth: 520, margin: '40px auto' }}>
            <Empty emoji="👨‍👩‍👧" title={`Welcome, ${me.name.split(' ')[0]}`} body="Link your child's LevelUp account to see their spending, send allowance and set controls." />
            <LinkChild onDone={() => after()} />
          </div>
        );
        const c = d.children[Math.min(sel, d.children.length - 1)];
        const first = c.name.split(' ')[0];
        const closeTopup = () => { setTopup(false); setAmount(''); setNote(''); setSent(0); setError(''); };
        const sendTopup = async (e: FormEvent) => {
          e.preventDefault(); setBusy('topup'); setError('');
          try { await api(`/parent/children/${c.id}/topup`, { body: { amount: toPaise(amount), note: note || undefined } }); setSent(toPaise(amount)!); after(); }
          catch (e) { setError(errMsg(e)); } finally { setBusy(''); }
        };
        return (
          <div className="stack">
            <div className="row between wrap">
              <div><h1>Family dashboard</h1><p className="muted small">Hi {me.name.split(' ')[0]}. Here's how {first} is doing.</p></div>
              <div className="row wrap" style={{ gap: 8 }}>
                {d.children.length > 1 && d.children.map((ch, i) => <button key={ch.id} className="chip" aria-pressed={i === sel} onClick={() => setSel(i)}>{ch.avatar} {ch.name.split(' ')[0]}</button>)}
                <Button size="sm" variant="ghost" onClick={() => setLinking(true)}><Plus size={15} /> Link child</Button>
              </div>
            </div>

            {d.pending.length > 0 && (
              <section className="card" style={{ borderColor: 'rgba(255,194,75,.45)' }} aria-labelledby="pp-h">
                <div className="section-head"><h3 id="pp-h">Needs your approval</h3><span className="badge-pill warn">{d.pending.length} waiting</span></div>
                <div className="col">
                  {d.pending.map((a) => {
                    const who = d.children.find((x) => x.id === a.childId);
                    return (
                      <div key={a.id} className="card tight row wrap">
                        <span className="avatar" aria-hidden>{TYPE_EMOJI[a.type] ?? '📨'}</span>
                        <div className="grow" style={{ minWidth: 180 }}><div style={{ fontWeight: 700 }}>{who?.name.split(' ')[0]}: {a.title}</div><div className="small muted">{a.detail} · {ago(a.createdAt)}</div></div>
                        <div className="row" style={{ gap: 8 }}>
                          <Button size="sm" loading={busy === a.id + 'approve'} disabled={!!busy} onClick={() => decide(a, 'approve')}><Check size={15} /> Approve</Button>
                          <Button size="sm" variant="danger" loading={busy === a.id + 'decline'} disabled={!!busy} onClick={() => decide(a, 'decline')}><X size={15} /> Decline</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="cols">
              <div className="stack">
                <section className="hero" aria-label={`${first}'s overview`}>
                  <div className="row between">
                    <div className="row"><span className="avatar" style={{ background: 'rgba(0,0,0,.25)' }} aria-hidden>{c.avatar}</span><div><div style={{ fontFamily: 'var(--display)', fontWeight: 650, fontSize: 18 }}>{c.name}</div><div className="sub">Level {c.level.level} {c.level.title} · {c.streak}-day streak</div></div></div>
                    {c.card.parentLocked && <span className="badge-pill" style={{ background: 'rgba(0,0,0,.3)' }}><Lock size={12} /> Locked</span>}
                  </div>
                  <div className="sub" style={{ marginTop: 16 }}>Wallet balance · simulated</div>
                  <div className="balance"><Money value={c.balance} /></div>
                  <Button style={{ marginTop: 14 }} onClick={() => setTopup(true)}><Send size={17} /> Send money</Button>
                </section>

                <div className="grid3">
                  <div className="card tight stat"><span className="tiny muted">Spent this month</span><b>{inr(c.monthSpent)}</b><Bar value={pct(c.monthSpent, c.budget)} tone={c.monthSpent > c.budget ? 'red' : ''} label="Budget used" /><span className="tiny muted">of {inr(c.budget)} budget</span></div>
                  <div className="card tight stat"><span className="tiny muted">Saved this month</span><b className="green">{inr(c.monthSaved)}</b><span className="tiny muted">into vaults</span></div>
                  <div className="card tight stat"><span className="tiny muted">Money health</span><b>{c.health.score}<span className="small muted">/100</span></b><span className="tiny muted">{c.health.label}</span></div>
                </div>

                <section className="card" aria-labelledby="ps-h">
                  <div className="section-head"><h3 id="ps-h">Spending overview</h3><span className="small muted">{inr(c.weekSpent)} this week</span></div>
                  {c.daily.some((x) => x.spent > 0) ? <Bars title={`${first}'s spending per day, last 7 days`} data={c.daily.map((x) => ({ label: x.label, values: [x.spent] }))} series={[{ name: 'Spent', color: SERIES.spent }]} height={140} /> : <Empty emoji="🌤️" title="No spending in the last 7 days" />}
                  {c.monthSpent > 0 && <><hr className="divider" style={{ margin: '16px 0' }} /><div className="donut-wrap"><Donut data={c.categories} /><CategoryLegend data={c.categories} /></div></>}
                </section>

                <section className="card" aria-labelledby="pr-h">
                  <div className="section-head"><h3 id="pr-h">Recent activity</h3></div>
                  {c.recent.length ? <div className="list">{c.recent.map((t) => <div key={t.id} style={{ pointerEvents: 'none' }}><TxnRow t={t} to="#" /></div>)}</div> : <Empty emoji="🧾" title="No activity yet" body={`${first}'s payments will appear here as they happen.`} />}
                </section>
              </div>

              <div className="stack">
                <Allowance key={`a-${c.id}`} child={c} onSaved={() => after()} />
                <Controls key={`c-${c.id}`} child={c} onSaved={() => after()} />
                <section className="card" aria-labelledby="pv-h">
                  <div className="section-head"><h3 id="pv-h">Savings progress</h3></div>
                  {c.vaults.length ? <div className="col" style={{ gap: 14 }}>{c.vaults.map((v) => (
                    <div key={v.id} className="row"><Ring value={v.saved / v.target} size={48} stroke={5} color={v.color} label={`${v.name} ${pct(v.saved, v.target)}%`}><span aria-hidden>{v.emoji}</span></Ring>
                      <div className="grow"><div className="row between"><span style={{ fontWeight: 650 }}>{v.name}</span><span className="num small muted">{pct(v.saved, v.target)}%</span></div><div className="small muted">{inr(v.saved)} of {inr(v.target)}{v.completedAt ? ' · complete 🎉' : ''}</div></div></div>
                  ))}</div> : <Empty emoji="🔐" title="No savings goals yet" body={`Encourage ${first} to create a first vault.`} />}
                </section>
                {d.history.length > 0 && (
                  <section className="card" aria-labelledby="ph-h"><div className="section-head"><h3 id="ph-h">Past decisions</h3></div>
                    <div className="list">{d.history.map((a) => (<div key={a.id} className="item"><span className="avatar sm" aria-hidden>{TYPE_EMOJI[a.type] ?? '📨'}</span><div className="grow"><div className="small" style={{ fontWeight: 650 }}>{a.title}</div><div className="tiny muted">{a.resolvedAt ? ago(a.resolvedAt) : ''}</div></div><span className={`badge-pill ${a.status === 'approved' ? 'green' : 'red'}`}>{a.status}</span></div>))}</div>
                  </section>
                )}
              </div>
            </div>

            {topup && (
              <Sheet title={sent ? 'Sent' : `Send money to ${first}`} onClose={closeTopup}>
                {sent ? <Success title={`${inr(sent)} sent`} body={`${first} has been notified.`}><Button block onClick={closeTopup}>Done</Button></Success> : (
                  <form className="col" style={{ gap: 14 }} onSubmit={sendTopup}>
                    <AmountInput value={amount} onChange={setAmount} presets={[200, 500, 1000, 2000]} />
                    <Field label="Note (optional)" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder="For the school trip" />
                    <p className="hint">Simulated top-up. No real money leaves your account.</p>
                    {error && <div className="error-text" role="alert">{error}</div>}
                    <Button type="submit" block loading={busy === 'topup'} disabled={!toPaise(amount)}>Send {toPaise(amount) ? inr(toPaise(amount)!) : ''}</Button>
                  </form>
                )}
              </Sheet>
            )}
            {linking && <Sheet title="Link another child" onClose={() => setLinking(false)}><LinkChild onDone={() => { setLinking(false); after(); }} /></Sheet>}
          </div>
        );
      }}</Load>
    </div>
  );
}

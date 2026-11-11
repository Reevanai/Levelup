import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errMsg, type Vault } from '../api';
import { useAfter, useToast } from '../ctx';
import { AmountInput, Bar, Button, Empty, Field, Load, Money, PageHead, Ring, Sheet, Success } from '../ui';
import { fmtDate, fmtDay, fmtTime, inr, pct, toPaise } from '../lib';

interface VaultsData { vaults: Vault[]; balance: number; monthSaved: number; savingsTarget: number; suggestion: { suggested: number; reason: string } }
interface Detail { vault: Vault; entries: { id: string; amount: number; createdAt: number }[]; balance: number }
const PRESETS = [
  { name: 'New smartphone', emoji: '📱', color: '#39e58c' }, { name: 'Gaming PC', emoji: '🖥️', color: '#8b5cf6' }, { name: 'Emergency savings', emoji: '🛟', color: '#38bdf8' },
  { name: 'Shopping', emoji: '🛍️', color: '#f472b6' }, { name: 'Travel', emoji: '✈️', color: '#fb923c' }, { name: 'Custom goal', emoji: '⭐', color: '#facc15' },
];
const EMOJIS = ['📱', '🖥️', '🛟', '🛍️', '✈️', '⭐', '🎧', '🚲', '🎸', '👟', '🎓', '🎁'];
const COLORS = ['#8b5cf6', '#39e58c', '#38bdf8', '#f472b6', '#fb923c', '#facc15'];

/** What it takes to hit the target date. */
function plan(v: Vault) {
  const left = v.target - v.saved;
  if (left <= 0) return 'Goal reached. You did it!';
  if (!v.targetDate) return `${inr(left)} to go. Add a target date to get a weekly plan.`;
  const days = Math.ceil((Date.parse(v.targetDate + 'T23:59:59+05:30') - Date.now()) / 86400000);
  if (days <= 0) return `Target date passed with ${inr(left)} to go. Move the date or top it up.`;
  const weeks = Math.max(1, Math.ceil(days / 7));
  return `Save ${inr(Math.ceil(left / weeks / 100) * 100)} a week to finish by ${fmtDay(v.targetDate)} (${days} days).`;
}

function VaultForm({ initial, onClose, onSaved }: { initial?: Vault; onClose: () => void; onSaved: (v: Vault) => void }) {
  const [name, setName] = useState(initial?.name ?? ''); const [emoji, setEmoji] = useState(initial?.emoji ?? '⭐'); const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [target, setTarget] = useState(initial ? String(initial.target / 100) : ''); const [date, setDate] = useState(initial?.targetDate ?? '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const paise = toPaise(target);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const body = { name, emoji, color, target: paise, targetDate: date || null };
      const r = await api<Detail>(initial ? `/vaults/${initial.id}` : '/vaults', { method: initial ? 'PATCH' : 'POST', body });
      onSaved(r.vault);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Sheet title={initial ? 'Edit vault' : 'New savings vault'} onClose={onClose}>
      <form className="col" style={{ gap: 14 }} onSubmit={submit}>
        {!initial && <div className="chips scroll" style={{ margin: 0, padding: '2px 0' }} role="group" aria-label="Goal ideas">
          {PRESETS.map((p) => <button type="button" key={p.name} className="chip" aria-pressed={name === p.name} onClick={() => { setName(p.name === 'Custom goal' ? '' : p.name); setEmoji(p.emoji); setColor(p.color); }}>{p.emoji} {p.name}</button>)}
        </div>}
        <Field label="Goal name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="What are you saving for?" required />
        <div className="field"><span className="label">Icon</span><div className="chips" role="group" aria-label="Icon">{EMOJIS.map((e) => <button type="button" key={e} className="chip" style={{ padding: '0 10px', fontSize: 18 }} aria-pressed={emoji === e} aria-label={`Icon ${e}`} onClick={() => setEmoji(e)}>{e}</button>)}</div></div>
        <div className="field"><span className="label">Colour</span><div className="chips" role="group" aria-label="Colour">{COLORS.map((c) => <button type="button" key={c} className="swatch" style={{ background: c, width: 38 }} aria-pressed={color === c} aria-label={`Colour ${c}`} onClick={() => setColor(c)} />)}</div></div>
        <div className="grid2">
          <Field label="Target amount (₹)" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ''))} placeholder="25,000" required />
          <Field label="Target date (optional)" type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
        </div>
        {error && <div className="error-text" role="alert">{error}</div>}
        <Button type="submit" block loading={busy} disabled={!paise || name.trim().length < 2}>{initial ? 'Save changes' : 'Create vault'}</Button>
      </form>
    </Sheet>
  );
}

export function Vaults() {
  const q = useQuery({ queryKey: ['vaults'], queryFn: () => api<VaultsData>('/vaults') });
  const [creating, setCreating] = useState(false);
  const after = useAfter(); const nav = useNavigate(); const toast = useToast();
  return (
    <div className="page">
      <PageHead title="Savings vaults" back="/app" right={<Button size="sm" onClick={() => setCreating(true)}><Plus size={16} /> New</Button>} />
      <Load q={q}>{(d) => {
        const total = d.vaults.reduce((a, v) => a + v.saved, 0);
        return (
          <div className="cols">
            <div className="stack">
              {d.vaults.length === 0 ? (
                <div className="card"><Empty emoji="🔐" title="Your first vault is waiting" body="Pick something you want, set a target and watch the ring fill up." action={<Button onClick={() => setCreating(true)}>Create a vault</Button>} /></div>
              ) : d.vaults.map((v) => (
                <Link key={v.id} to={`/app/vaults/${v.id}`} className="card press">
                  <div className="row" style={{ gap: 14 }}>
                    <Ring value={v.saved / v.target} size={72} color={v.color} label={`${v.name}: ${pct(v.saved, v.target)}% saved`}><span style={{ fontSize: 26 }} aria-hidden>{v.emoji}</span></Ring>
                    <div className="grow">
                      <div className="row between"><h3 className="truncate">{v.name}</h3>{v.completedAt ? <span className="badge-pill green">Complete</span> : <span className="num muted small">{pct(v.saved, v.target)}%</span>}</div>
                      <div style={{ marginTop: 2 }}><Money value={v.saved} className="" /> <span className="muted small">of {inr(v.target)}</span></div>
                      <div className="tiny muted" style={{ marginTop: 4 }}>{plan(v)}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="stack">
              <section className="card glow"><div className="up">Total in vaults</div><div className="num" style={{ fontSize: 34, fontWeight: 750 }}><Money value={total} /></div>
                <div className="small t2" style={{ margin: '4px 0 12px' }}>{inr(d.monthSaved)} saved this month · target {inr(d.savingsTarget)}</div>
                <Bar value={pct(d.monthSaved, d.savingsTarget)} tone="green" label="Monthly savings target" /></section>
              <section className="card"><div className="up">Suggested monthly target</div>
                <div className="num" style={{ fontSize: 24, fontWeight: 700, margin: '2px 0 6px' }}>{inr(d.suggestion.suggested)}</div><p className="small muted">{d.suggestion.reason}</p>
                {d.suggestion.suggested !== d.savingsTarget && <Button size="sm" variant="ghost" style={{ marginTop: 12 }} onClick={async () => {
                  try { after(await api('/me', { method: 'PATCH', body: { savingsTarget: d.suggestion.suggested } })); toast({ kind: 'ok', text: 'Savings target updated' }); } catch (e) { toast({ kind: 'error', text: errMsg(e) }); } }}>Use this target</Button>}
              </section>
              <div className="notice"><span>Vaults are simulated savings pots inside this prototype. They don't earn interest and aren't deposits.</span></div>
            </div>
          </div>
        );
      }}</Load>
      {creating && <VaultForm onClose={() => setCreating(false)} onSaved={(v) => { setCreating(false); after(); nav(`/app/vaults/${v.id}`); }} />}
    </div>
  );
}

export function VaultDetail() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['vault', id], queryFn: () => api<Detail>(`/vaults/${id}`) });
  const after = useAfter(), toast = useToast(), nav = useNavigate();
  const [move, setMove] = useState<'deposit' | 'withdraw' | null>(null);
  const [amount, setAmount] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [done, setDone] = useState<{ amount: number; completed: boolean } | null>(null);
  const [editing, setEditing] = useState(false); const [deleting, setDeleting] = useState(false);
  const paise = toPaise(amount);
  const close = () => { setMove(null); setAmount(''); setError(''); setDone(null); };

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await api<Detail & { reward: any; justCompleted: boolean }>(`/vaults/${id}/${move}`, { body: { amount: paise } });
      after(r as any);
      if (r.justCompleted) toast({ kind: 'reward', emoji: '🎉', text: 'Goal complete!', sub: '+100 XP' });
      else if (r.reward) toast({ kind: 'ok', emoji: '⚡', text: `+${r.reward.xp} XP for saving` });
      setDone({ amount: paise!, completed: r.justCompleted });
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { const r = await api<{ returned: number }>(`/vaults/${id}`, { method: 'DELETE' }); after(); toast({ kind: 'ok', text: 'Vault closed', sub: r.returned ? `${inr(r.returned)} returned to your wallet` : undefined }); nav('/app/vaults', { replace: true }); }
    catch (e) { toast({ kind: 'error', text: errMsg(e) }); setBusy(false); }
  }

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <Load q={q}>{({ vault: v, entries, balance }) => (
        <>
          <PageHead title={v.name} back="/app/vaults" right={<div className="row" style={{ gap: 8 }}>
            <button className="icon-btn" aria-label="Edit vault" onClick={() => setEditing(true)}><Pencil size={18} /></button>
            <button className="icon-btn" aria-label="Close vault" onClick={() => setDeleting(true)}><Trash2 size={18} /></button></div>} />
          <div className="stack">
            <section className="card col" style={{ alignItems: 'center', textAlign: 'center', gap: 10 }}>
              <Ring value={v.saved / v.target} size={190} stroke={14} color={v.color} label={`${pct(v.saved, v.target)}% of goal saved`}>
                <div><div style={{ fontSize: 40 }} aria-hidden>{v.emoji}</div><div className="num" style={{ fontSize: 30, fontWeight: 750 }}>{pct(v.saved, v.target)}%</div></div>
              </Ring>
              <div className="num" style={{ fontSize: 30, fontWeight: 750 }}><Money value={v.saved} /> <span className="muted" style={{ fontSize: 16, fontWeight: 500 }}>of {inr(v.target)}</span></div>
              {v.completedAt ? <span className="badge-pill green">🎉 Completed {fmtDate(v.completedAt)}</span> : <p className="small t2">{plan(v)}</p>}
              <div className="grid2" style={{ width: '100%', marginTop: 8 }}>
                <Button onClick={() => setMove('deposit')}><ArrowDownLeft size={18} /> Add money</Button>
                <Button variant="ghost" disabled={v.saved === 0} onClick={() => setMove('withdraw')}><ArrowUpRight size={18} /> Withdraw</Button>
              </div>
            </section>
            <div className="grid3">
              <div className="card tight stat"><span className="tiny muted">Remaining</span><b>{inr(Math.max(0, v.target - v.saved))}</b></div>
              <div className="card tight stat"><span className="tiny muted">Target date</span><b style={{ fontSize: 15 }}>{v.targetDate ? fmtDay(v.targetDate) : 'Not set'}</b></div>
              <div className="card tight stat"><span className="tiny muted">Deposits</span><b>{entries.filter((e) => e.amount > 0).length}</b></div>
            </div>
            <section className="card" aria-labelledby="v-hist">
              <div className="section-head"><h3 id="v-hist">Deposit history</h3></div>
              {entries.length ? <div className="list">{entries.map((e) => (
                <div key={e.id} className="item"><div className={`ico-sq ${e.amount > 0 ? 'in' : 'out'}`}>{e.amount > 0 ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</div>
                  <div className="grow"><div style={{ fontWeight: 650 }}>{e.amount > 0 ? 'Deposit' : 'Withdrawal'}</div><div className="small muted">{fmtDate(e.createdAt)}, {fmtTime(e.createdAt)}</div></div>
                  <span className="num" style={{ fontWeight: 650, color: e.amount > 0 ? 'var(--green)' : undefined }}>{inr(e.amount, { sign: true })}</span></div>
              ))}</div> : <Empty emoji="🌱" title="No deposits yet" body="Your first deposit earns the First Stash badge." />}
            </section>
          </div>

          {move && (
            <Sheet title={done ? 'Done' : move === 'deposit' ? `Add to ${v.name}` : `Withdraw from ${v.name}`} onClose={close}>
              {done ? <Success title={move === 'deposit' ? `${inr(done.amount)} saved` : `${inr(done.amount)} back in your wallet`} body={done.completed ? `You hit your ${inr(v.target)} goal. Legend.` : undefined}><Button block onClick={close}>Done</Button></Success> : (
                <form className="col" style={{ gap: 14 }} onSubmit={submit}>
                  <AmountInput value={amount} onChange={setAmount} presets={move === 'deposit' ? [100, 500, 1000, 2000] : [500, 1000]} />
                  <p className="hint" style={{ textAlign: 'center' }}>{move === 'deposit' ? `Wallet balance: ${inr(balance)}` : `In this vault: ${inr(v.saved)}`}</p>
                  {error && <div className="error-text" role="alert">{error}</div>}
                  <Button type="submit" block loading={busy} disabled={!paise}>{move === 'deposit' ? 'Save' : 'Withdraw'} {paise ? inr(paise) : ''}</Button>
                </form>
              )}
            </Sheet>
          )}
          {editing && <VaultForm initial={v} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); after(); }} />}
          {deleting && (
            <Sheet title="Close this vault?" onClose={() => setDeleting(false)}>
              <div className="col" style={{ gap: 14 }}>
                <p className="t2">{v.saved > 0 ? `The ${inr(v.saved)} inside goes back to your wallet.` : 'This vault is empty.'} Its history will be removed. This can't be undone.</p>
                <Button variant="danger" block loading={busy} onClick={remove}>Close vault</Button><Button variant="ghost" block onClick={() => setDeleting(false)}>Keep it</Button>
              </div>
            </Sheet>
          )}
        </>
      )}</Load>
    </div>
  );
}

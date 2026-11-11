import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Globe, Store } from 'lucide-react';
import { api, ApiError, errMsg, type Txn } from './api';
import { Cancelled, useAfter, useMe, usePin } from './ctx';
import { AmountInput, Button, Field, Sheet, SimNotice, Success } from './ui';
import { inr, toPaise } from './lib';
import { CATEGORIES } from '../shared/constants';

export type MoneySheetKind = 'add' | 'send' | 'request' | 'pay';
interface Contact { handle: string; name: string; avatar: string }
const useWalletMeta = () => useQuery({ queryKey: ['wallet'], queryFn: () => api<{ contacts: Contact[]; hasParent: boolean; balance: number }>('/wallet') });

export function MoneySheet({ kind, onClose }: { kind: MoneySheetKind; onClose: () => void }) {
  if (kind === 'add') return <AddMoney onClose={onClose} />;
  if (kind === 'send') return <SendMoney onClose={onClose} />;
  if (kind === 'request') return <RequestMoney onClose={onClose} />;
  return <PayMerchant onClose={onClose} />;
}

function Done({ title, body, txn, onClose, pending }: { title: string; body?: ReactNode; txn?: Txn; onClose: () => void; pending?: boolean }) {
  return (
    <Success title={title} body={body} pending={pending}>
      {txn && <Link to={`/app/txn/${txn.id}`} className="btn ghost block" onClick={onClose}>View receipt</Link>}
      <Button block onClick={onClose} data-autofocus>Done</Button>
    </Success>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setError(''); setBusy(true);
    try { return await fn(); }
    catch (e) { if (!(e instanceof Cancelled)) setError(errMsg(e)); return undefined; }
    finally { setBusy(false); }
  }
  return { busy, error, setError, go };
}

function AddMoney({ onClose }: { onClose: () => void }) {
  const after = useAfter();
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<'demo_bank' | 'demo_upi'>('demo_bank');
  const [done, setDone] = useState<Txn | null>(null);
  const { busy, error, go } = useSubmit();
  const paise = toPaise(amount);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await go(() => api<{ txn: Txn }>('/wallet/add', { body: { amount: paise, source } }));
    if (r) { after(r as any); setDone(r.txn); }
  }
  return (
    <Sheet title={done ? 'Money added' : 'Add money'} onClose={onClose}>
      {done ? <Done title={`${inr(done.amount)} added`} body={`New balance ${inr(done.balanceAfter)}`} txn={done} onClose={onClose} /> : (
        <form className="col" style={{ gap: 16 }} onSubmit={submit}>
          <AmountInput value={amount} onChange={setAmount} presets={[200, 500, 1000, 2500]} />
          <div className="field">
            <span className="label" id="src">From</span>
            <div className="chips" role="group" aria-labelledby="src">
              <button type="button" className="chip" aria-pressed={source === 'demo_bank'} onClick={() => setSource('demo_bank')}>🏦 Demo bank account</button>
              <button type="button" className="chip" aria-pressed={source === 'demo_upi'} onClick={() => setSource('demo_upi')}>📲 Demo UPI app</button>
            </div>
          </div>
          <SimNotice>Prototype top-up: no bank or UPI app is contacted and no real money is collected. Up to ₹10,000 per top-up.</SimNotice>
          {error && <div className="error-text" role="alert">{error}</div>}
          <Button type="submit" block loading={busy} disabled={!paise}>Add {paise ? inr(paise) : 'money'}</Button>
        </form>
      )}
    </Sheet>
  );
}

function Recipients({ value, onChange, contacts, parent }: { value: string; onChange: (v: string) => void; contacts: Contact[]; parent?: string | null }) {
  return (
    <div className="chips scroll" role="group" aria-label="Contacts" style={{ margin: 0, padding: '2px 0' }}>
      {parent && <button type="button" className="chip" aria-pressed={value === 'parent'} onClick={() => onChange('parent')}>🦉 {parent} (parent)</button>}
      {contacts.map((c) => <button type="button" key={c.handle} className="chip" aria-pressed={value === c.handle} onClick={() => onChange(c.handle)}>{c.avatar} {c.name}</button>)}
    </div>
  );
}

function SendMoney({ onClose }: { onClose: () => void }) {
  const after = useAfter(), withPin = usePin(), meta = useWalletMeta();
  const [to, setTo] = useState(''); const [amount, setAmount] = useState(''); const [note, setNote] = useState('');
  const [done, setDone] = useState<Txn | null>(null);
  const { busy, error, go } = useSubmit();
  const paise = toPaise(amount);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await go(() => withPin(`Send ${inr(paise!)}`, (pin) => api<{ txn: Txn }>('/wallet/send', { body: { amount: paise, to: to.trim().toLowerCase(), note: note || undefined, pin } })));
    if (r) { after(r as any); setDone(r.txn); }
  }
  return (
    <Sheet title={done ? 'Sent' : 'Send money'} onClose={onClose}>
      {done ? <Done title={`${inr(done.amount)} sent`} body={done.title} txn={done} onClose={onClose} /> : (
        <form className="col" style={{ gap: 14 }} onSubmit={submit}>
          <Recipients value={to} onChange={setTo} contacts={meta.data?.contacts ?? []} />
          <Field label="LevelUp handle" placeholder="friend@levelup" value={to} onChange={(e) => setTo(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} hint="Pick a contact or type a handle." />
          <AmountInput value={amount} onChange={setAmount} presets={[50, 100, 250, 500]} />
          <Field label="Note (optional)" placeholder="Pizza split 🍕" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />
          <p className="hint">Wallet balance: {inr(meta.data?.balance ?? 0)} · simulated transfer</p>
          {error && <div className="error-text" role="alert">{error}</div>}
          <Button type="submit" block loading={busy} disabled={!paise || !to.trim()}>Continue</Button>
        </form>
      )}
    </Sheet>
  );
}

function RequestMoney({ onClose }: { onClose: () => void }) {
  const after = useAfter(), me = useMe(), meta = useWalletMeta();
  const [from, setFrom] = useState(me.parent ? 'parent' : ''); const [amount, setAmount] = useState(''); const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, go } = useSubmit();
  const paise = toPaise(amount);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await go(() => api('/wallet/request', { body: { amount: paise, from: from.trim().toLowerCase(), note: note || undefined } }));
    if (r) { after(); setDone(true); }
  }
  return (
    <Sheet title={done ? 'Request sent' : 'Request money'} onClose={onClose}>
      {done ? <Done pending title={`${inr(paise!)} requested`} body={from === 'parent' ? `${me.parent?.name} will get a notification to approve it.` : 'You can track it under Requests in your wallet.'} onClose={onClose} /> : (
        <form className="col" style={{ gap: 14 }} onSubmit={submit}>
          <Recipients value={from} onChange={setFrom} contacts={meta.data?.contacts ?? []} parent={me.parent?.name.split(' ')[0]} />
          {from !== 'parent' && <Field label="LevelUp handle" placeholder="friend@levelup" value={from} onChange={(e) => setFrom(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />}
          <AmountInput value={amount} onChange={setAmount} presets={[100, 250, 500, 1000]} />
          <Field label="What's it for?" placeholder="Class trip" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />
          {!me.parent && <p className="hint">Tip: link a parent from Profile to request allowance top-ups.</p>}
          {error && <div className="error-text" role="alert">{error}</div>}
          <Button type="submit" block loading={busy} disabled={!paise || !from.trim()}>Send request</Button>
        </form>
      )}
    </Sheet>
  );
}

const MERCHANTS = [
  { name: 'Zesto Eats', category: 'food', channel: 'online', amount: 240 }, { name: 'PixelPlay Store', category: 'gaming', channel: 'online', amount: 399 },
  { name: 'MetroRide', category: 'transport', channel: 'instore', amount: 40 }, { name: 'UrbanThreads', category: 'shopping', channel: 'online', amount: 1799 },
  { name: 'CineVerse', category: 'entertainment', channel: 'online', amount: 320 }, { name: 'BookNest', category: 'education', channel: 'instore', amount: 450 },
] as const;

function PayMerchant({ onClose }: { onClose: () => void }) {
  const after = useAfter(), withPin = usePin(), meta = useWalletMeta();
  const [merchant, setMerchant] = useState(''); const [category, setCategory] = useState('food'); const [channel, setChannel] = useState<'online' | 'instore'>('online');
  const [amount, setAmount] = useState('');
  const [done, setDone] = useState<{ txn?: Txn; pending?: string } | null>(null);
  const [declined, setDeclined] = useState<{ message: string; txnId?: string } | null>(null);
  const { busy, error, go } = useSubmit();
  const paise = toPaise(amount);
  async function submit(e: FormEvent) {
    e.preventDefault(); setDeclined(null);
    const r = await go(async () => {
      try {
        return await withPin(`Pay ${inr(paise!)}`, (pin) => api<{ status: string; txn?: Txn; message?: string }>('/wallet/pay', { body: { amount: paise, merchant: merchant.trim(), category, channel, pin } }));
      } catch (err) {
        if (err instanceof ApiError && err.code === 'DECLINED') { setDeclined({ message: err.message, txnId: err.data.txnId as string }); after(); return undefined; }
        throw err;
      }
    });
    if (r) { after(r as any); setDone(r.status === 'paid' ? { txn: r.txn } : { pending: r.message }); }
  }
  return (
    <Sheet title={done ? (done.pending ? 'Waiting for approval' : 'Paid') : 'Pay with card'} onClose={onClose}>
      {done ? (done.pending ? <Done pending title="Sent to your parent" body={done.pending} onClose={onClose} /> : <Done title={`${inr(done.txn!.amount)} paid`} body={done.txn!.title} txn={done.txn} onClose={onClose} />) : (
        <form className="col" style={{ gap: 14 }} onSubmit={submit}>
          <div className="field">
            <span className="label">Demo checkout</span>
            <div className="chips scroll" style={{ margin: 0, padding: '2px 0' }}>
              {MERCHANTS.map((m) => <button type="button" key={m.name} className="chip" aria-pressed={merchant === m.name}
                onClick={() => { setMerchant(m.name); setCategory(m.category); setChannel(m.channel); setAmount(String(m.amount)); }}>{CATEGORIES.find((c) => c.key === m.category)!.emoji} {m.name}</button>)}
            </div>
          </div>
          <Field label="Merchant" placeholder="Where are you paying?" value={merchant} maxLength={40} onChange={(e) => setMerchant(e.target.value)} />
          <div className="grid2">
            <div className="field">
              <label htmlFor="pay-cat">Category</label>
              <select id="pay-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}</select>
            </div>
            <div className="field">
              <span className="label" id="chan">Where</span>
              <div className="chips" role="group" aria-labelledby="chan">
                <button type="button" className="chip" aria-pressed={channel === 'online'} onClick={() => setChannel('online')}><Globe size={14} /> Online</button>
                <button type="button" className="chip" aria-pressed={channel === 'instore'} onClick={() => setChannel('instore')}><Store size={14} /> In store</button>
              </div>
            </div>
          </div>
          <AmountInput value={amount} onChange={setAmount} presets={[50, 200, 500, 2000]} />
          <p className="hint">Simulated card payment from your wallet ({inr(meta.data?.balance ?? 0)}). Your card controls and limits apply.</p>
          {declined && <div className="notice" role="alert" style={{ borderColor: 'rgba(255,107,129,.5)', background: 'rgba(255,107,129,.08)', color: '#ffc2cb' }}>
            <span><b>Declined.</b> {declined.message} {declined.txnId && <Link className="link" to={`/app/txn/${declined.txnId}`} onClick={onClose}>Details</Link>}</span></div>}
          {error && <div className="error-text" role="alert">{error}</div>}
          <Button type="submit" block loading={busy} disabled={!paise || merchant.trim().length < 2}>Pay {paise ? inr(paise) : ''}</Button>
        </form>
      )}
    </Sheet>
  );
}

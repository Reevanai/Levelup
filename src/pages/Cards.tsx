import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Eye, EyeOff, Globe, Lock, Plane, ScanLine, Snowflake, Store } from 'lucide-react';
import { CardFan, designOf } from '../cardstack';
import { api, errMsg, type CardT, type Txn } from '../api';
import { Cancelled, useAfter, usePin, useToast } from '../ctx';
import { Bar, Button, Empty, Load, PageHead, Toggle, TxnRow } from '../ui';
import { inr, pct } from '../lib';
import { MoneySheet } from '../sheets';
import { CARD_DESIGNS } from '../../shared/constants';

interface CardData { card: CardT; holder: string; hasParent: boolean; holoUnlocked: boolean; pendingLimits: { id: string; title: string }[]; recent: Txn[]; requested?: string[] }
type Reveal = { number: string; cvv: string; expiry: string };

function LimitRow({ label, value, used, max, onSave, hasParent }: { label: string; value: number; used?: number; max: number; onSave: (v: number) => Promise<void>; hasParent: boolean }) {
  const [v, setV] = useState(value / 100);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(value / 100), [value]);
  const dirty = v * 100 !== value, raising = v * 100 > value;
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row between"><label className="label" htmlFor={`lim-${label}`}>{label}</label><b className="num">{inr(v * 100)}</b></div>
      <input id={`lim-${label}`} type="range" min={100} max={max} step={100} value={v} onChange={(e) => setV(Number(e.target.value))} aria-valuetext={inr(v * 100)} />
      {used !== undefined && <><Bar value={pct(used, value)} tone={used > value * 0.85 ? 'warn' : 'green'} label={`${label} used`} /><div className="tiny muted">{inr(used)} used of {inr(value)}</div></>}
      {dirty && <div className="row"><Button size="sm" loading={busy} onClick={async () => { setBusy(true); await onSave(v * 100); setBusy(false); }}>{raising && hasParent ? 'Ask parent to raise' : 'Save limit'}</Button><Button size="sm" variant="ghost" onClick={() => setV(value / 100)}>Reset</Button></div>}
    </div>
  );
}

export function Cards() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['card'], queryFn: () => api<CardData>('/card') });
  const toast = useToast(), withPin = usePin(), after = useAfter();
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [pay, setPay] = useState(false);
  const [left, setLeft] = useState(0);

  // Revealed details hide themselves again after 30 seconds.
  useEffect(() => {
    if (!reveal) return;
    setLeft(30);
    const t = setInterval(() => setLeft((s) => { if (s <= 1) { setReveal(null); return 0; } return s - 1; }), 1000);
    return () => clearInterval(t);
  }, [reveal]);

  async function patch(body: Partial<Record<keyof CardT | 'design', unknown>>, msg?: string) {
    const prev = qc.getQueryData<CardData>(['card']);
    if (prev) qc.setQueryData(['card'], { ...prev, card: { ...prev.card, ...body } }); // optimistic
    try {
      const r = await api<CardData & { badges: any[] }>('/card', { method: 'PATCH', body });
      qc.setQueryData(['card'], r);
      after({ badges: r.badges });
      if (r.requested?.length) toast({ kind: 'ok', emoji: '📨', text: 'Sent to your parent for approval', sub: `Raise ${r.requested.join(', ')} limit` });
      else if (msg) toast({ kind: 'ok', text: msg });
    } catch (e) { if (prev) qc.setQueryData(['card'], prev); toast({ kind: 'error', text: errMsg(e) }); }
  }
  async function doReveal() {
    if (reveal) return setReveal(null);
    try { setReveal(await withPin('Reveal card details', (pin) => api<Reveal>('/card/reveal', { body: { pin } }))); }
    catch (e) { if (!(e instanceof Cancelled)) toast({ kind: 'error', text: errMsg(e) }); }
  }

  return (
    <div className="page">
      <PageHead title="Card" right={<span className="demo-flag">Demo card</span>} />
      <Load q={q}>{({ card, holder, hasParent, holoUnlocked, pendingLimits, recent }) => (
        <div className="cols">
          <div className="stack">
            {(() => {
              const usable = CARD_DESIGNS.filter((x) => x.key !== 'holo' || holoUnlocked);
              const i = Math.max(0, usable.findIndex((x) => x.key === card.design));
              const prev = usable[(i + usable.length - 1) % usable.length], next = usable[(i + 1) % usable.length], cur = designOf(card.design);
              const off = card.frozen || card.parentLocked;
              return (
                <section className="hero" aria-label="Your card">
                  <div className="balance" style={{ fontSize: 'clamp(30px, 9vw, 40px)' }}>{inr(card.usage.month)}</div>
                  <div className="sub" style={{ marginTop: 4 }}>spent this month, <span className="green">{inr(Math.max(0, card.monthlyLimit - card.usage.month))}</span> of limit left</div>
                  <CardFan
                    front={{ bg: cur.bg, ink: cur.ink, name: holder, sub: `XXXX ${card.last4}`, label: `LevelUp demo card ending ${card.last4}, ${cur.label} design${off ? ', frozen' : ''}`, off }}
                    left={{ bg: prev.bg, ink: prev.ink, name: prev.label, sub: 'tap to use', onClick: () => patch({ design: prev.key }), label: `Switch to ${prev.label} design` }}
                    right={{ bg: next.bg, ink: next.ink, name: next.label, sub: 'tap to use', onClick: () => patch({ design: next.key }), label: `Switch to ${next.label} design` }}
                    note={card.parentLocked ? <><Lock size={14} /> locked by parent</> : card.frozen ? <><Snowflake size={14} /> frozen</> : undefined}
                    tab={<span className="tiny" style={{ fontWeight: 700, letterSpacing: '.08em', color: '#8a8a8a' }}>DEMO · EXP {card.expiry}</span>} />
                </section>
              );
            })()}
            {reveal && (
              <div className="card tight" role="status">
                <dl className="row between" style={{ margin: 0, gap: 16 }}>
                  <div><dt className="tiny muted">demo number</dt><dd className="num" style={{ margin: 0, fontWeight: 650, letterSpacing: '.06em' }}>{reveal.number}</dd></div>
                  <div><dt className="tiny muted">exp</dt><dd className="num" style={{ margin: 0, fontWeight: 650 }}>{reveal.expiry}</dd></div>
                  <div><dt className="tiny muted">cvv</dt><dd className="num" style={{ margin: 0, fontWeight: 650 }}>{reveal.cvv}</dd></div>
                </dl>
                <p className="tiny muted" style={{ marginTop: 8 }}>Not a real card number. Hiding in {left}s.
                  <button className="link" style={{ marginLeft: 8 }} onClick={() => { navigator.clipboard?.writeText(reveal.number.replace(/ /g, '')); toast({ kind: 'ok', text: 'Demo number copied' }); }}>copy</button></p>
              </div>
            )}

            <nav className="actions" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }} aria-label="Card actions">
              <button className="action" onClick={() => patch({ frozen: !card.frozen })} disabled={card.parentLocked} aria-pressed={card.frozen}>
                <span className="ico"><Snowflake size={21} /></span>{card.frozen ? 'Unfreeze' : 'Freeze'}</button>
              <button className="action" onClick={doReveal} aria-pressed={!!reveal}><span className="ico">{reveal ? <EyeOff size={21} /> : <Eye size={21} />}</span>{reveal ? 'Hide' : 'Details'}</button>
              <button className="action" onClick={() => setPay(true)}><span className="ico"><ScanLine size={21} /></span>Test pay</button>
            </nav>
            {card.parentLocked && <div className="notice" role="status"><Lock size={16} /><span>Your parent has locked this card. Payments are paused until they unlock it.</span></div>}

            <section className="card" aria-labelledby="c-design">
              <div className="section-head"><h3 id="c-design">Card design</h3><span className="small muted">{CARD_DESIGNS.find((d) => d.key === card.design)?.label}</span></div>
              <div className="chips scroll" role="group" aria-label="Choose a card design" style={{ padding: '4px 18px' }}>
                {CARD_DESIGNS.map((d) => {
                  const locked = d.key === 'holo' && !holoUnlocked;
                  return <button key={d.key} className="swatch" style={{ background: d.bg, opacity: locked ? 0.55 : 1 }} aria-pressed={card.design === d.key} aria-label={`${d.label}${locked ? ' (locked, unlock in the reward store)' : ''}`} title={d.label}
                    onClick={() => (locked ? toast({ kind: 'ok', emoji: '🪩', text: 'Holo is a reward skin', sub: 'Unlock it for 500 coins in Rewards → Store.' }) : patch({ design: d.key }))}>{locked && <Lock size={14} color="#fff" />}</button>;
                })}
              </div>
            </section>

            <section className="card" aria-labelledby="c-recent">
              <div className="section-head"><h3 id="c-recent">Card payments</h3></div>
              {recent.length ? <div className="list">{recent.map((t) => <TxnRow key={t.id} t={t} />)}</div> : <Empty emoji="💳" title="No card payments yet" body="Try a test payment to see your controls in action." />}
            </section>
          </div>

          <div className="stack">
            <section className="card" aria-labelledby="c-ctrl">
              <div className="section-head"><h3 id="c-ctrl">Payment controls</h3></div>
              <div className="list">
                {([
                  ['onlineEnabled', 'Online payments', 'Apps and websites', Globe], ['instoreEnabled', 'In-store payments', 'Tap and scan at shops', Store],
                  ['internationalEnabled', 'International use', 'Payments outside India', Plane], ['notifyTxn', 'Payment notifications', 'Get an alert for every payment', Bell],
                ] as const).map(([key, label, sub, Icon]) => (
                  <div className="item" key={key}>
                    <div className="ico-sq"><Icon size={18} /></div>
                    <div className="grow"><div style={{ fontWeight: 650 }}>{label}</div><div className="small muted">{sub}</div></div>
                    <Toggle checked={card[key]} onChange={(v) => patch({ [key]: v })} label={label} />
                  </div>
                ))}
              </div>
            </section>

            <section className="card" aria-labelledby="c-lim">
              <div className="section-head"><h3 id="c-lim">Spending limits</h3></div>
              <div className="col" style={{ gap: 20 }}>
                <LimitRow label="Per payment" value={card.perTxnLimit} max={10000} hasParent={hasParent} onSave={(v) => patch({ perTxnLimit: v }, 'Limit updated')} />
                <LimitRow label="Daily" value={card.dailyLimit} used={card.usage.today} max={15000} hasParent={hasParent} onSave={(v) => patch({ dailyLimit: v }, 'Limit updated')} />
                <LimitRow label="Monthly" value={card.monthlyLimit} used={card.usage.month} max={50000} hasParent={hasParent} onSave={(v) => patch({ monthlyLimit: v }, 'Limit updated')} />
              </div>
              {pendingLimits.length > 0 && <div className="col" style={{ marginTop: 14, gap: 6 }}>{pendingLimits.map((p) => <span key={p.id} className="badge-pill warn" style={{ alignSelf: 'flex-start' }}>⏳ {p.title} · awaiting parent</span>)}</div>}
              <p className="hint" style={{ marginTop: 12 }}>{hasParent ? 'You can lower a limit instantly. Raising one asks your parent first.' : 'Limits apply to every card payment.'}</p>
              {hasParent && (card.approvalThreshold > 0 || card.blockedCategories.length > 0) && (
                <div className="col" style={{ marginTop: 12, gap: 6 }}>
                  <div className="up">Set by your parent</div>
                  {card.approvalThreshold > 0 && <span className="small t2">Payments over {inr(card.approvalThreshold)} need approval.</span>}
                  {card.blockedCategories.length > 0 && <span className="small t2">Blocked: {card.blockedCategories.join(', ')}.</span>}
                </div>
              )}
            </section>
            <div className="notice"><span>This is a demo card with a non-issuable number. It can't be used anywhere outside this prototype. A live LevelUp card would be issued by a licensed partner.</span></div>
          </div>
        </div>
      )}</Load>
      {pay && <MoneySheet kind="pay" onClose={() => setPay(false)} />}
    </div>
  );
}

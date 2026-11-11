import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Flame, HandCoins, Plus, ScanLine, Send, Settings as Cog, Snowflake, Sparkles, Zap } from 'lucide-react';
import { CardFan, designOf, tint, type Face } from '../cardstack';
import { api, type Cat, type Health, type Insight, type Level, type Me, type Mission, type Txn, type Vault } from '../api';
import { useAuth, useMe } from '../ctx';
import { Bar, Empty, Load, Money, Private, Ring, TxnRow } from '../ui';
import { Bars, SERIES } from '../charts';
import { inr, pct } from '../lib';
import { Bell2 } from '../shell';
import { MoneySheet, type MoneySheetKind } from '../sheets';

interface Dash {
  balance: number; monthSpent: number; monthReceived: number; monthSaved: number; weekSpent: number; budget: number; savingsTarget: number; recent: Txn[];
  vaults: Vault[]; totalSaved: number; totalTarget: number; level: Level; coins: number; streak: number; checkedInToday: boolean; health: Health;
  daily: { label: string; spent: number }[]; categories: Cat[]; missions: Mission[]; claimable: number; topInsight: Insight | null; cardFrozen: boolean; card: { design: string; last4: string };
}

export function Home() {
  const me = useMe();
  const { setUser } = useAuth();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dash>('/dashboard') });
  const [sheet, setSheet] = useState<MoneySheetKind | null>(null);
  const hidden = !!me.settings.hideBalance;
  const toggleHide = async () => setUser((await api<{ user: Me }>('/me', { method: 'PATCH', body: { settings: { hideBalance: !hidden } } })).user);

  return (
    <div className="page">
      <div className="topbar" style={{ paddingBottom: 6 }}>
        <div className="pills" aria-label="Your rewards">
          <Link to="/app/rewards" className="pill" aria-label={`${me.coins} coins`}><span className="em" aria-hidden>🪙</span>{me.coins.toLocaleString('en-IN')}</Link>
          <Link to="/app/rewards" className="pill" aria-label={`${me.level.xp} XP, level ${me.level.level}`}><span className="em" aria-hidden>⚡</span>{me.level.xp.toLocaleString('en-IN')}</Link>
          <Link to="/app/rewards" className="pill" aria-label={`${me.streak} day streak`}><span className="em" aria-hidden>🔥</span>{me.streak}</Link>
        </div>
        <div className="row" style={{ gap: 0 }}>
          <Bell2 base="/app" />
          <Link to="/app/settings" className="icon-btn" aria-label="Settings"><Cog size={20} /></Link>
        </div>
      </div>

      <Load q={q}>{(d) => {
        const left = Math.max(0, d.budget - d.monthSpent);
        const design = designOf(d.card.design);
        const side = (v?: Vault): Face => v
          ? { bg: tint(v.color), ink: '#0b0b0b', name: v.name, sub: `${pct(v.saved, v.target)}% saved`, mark: <span style={{ fontSize: 22 }}>{v.emoji}</span>, to: `/app/vaults/${v.id}`, label: `${v.name} vault, ${pct(v.saved, v.target)}% saved` }
          : { bg: 'linear-gradient(160deg,#2a2a2a,#141414)', ink: '#fff', name: 'New vault', sub: 'start a goal', mark: <Plus size={22} />, to: '/app/vaults', label: 'Create a savings vault' };
        return (
        <div className="cols">
          <div className="stack">
            <section className="hero" aria-label="Balance">
              <button className="balance" onClick={toggleHide} aria-label={hidden ? 'Show balance' : 'Hide balance'} aria-pressed={hidden} style={{ display: 'block', margin: '0 auto' }}><Private value={d.balance} /></button>
              <div className="sub" style={{ marginTop: 4 }}>
                used {d.budget ? ((d.monthSpent / d.budget) * 100).toFixed(1) : '0'}% of budget, <span className="green">{inr(left)}</span> left · <span>simulated</span>
              </div>
              <CardFan
                front={{ bg: design.bg, ink: design.ink, name: 'LevelUp', sub: `XXXX ${d.card.last4}`, to: '/app/cards', label: `Your LevelUp demo card ending ${d.card.last4}`, off: d.cardFrozen }}
                left={side(d.vaults[0])} right={side(d.vaults[1])}
                note={d.cardFrozen ? <><Snowflake size={14} /> card frozen</> : undefined}
                tab={<>
                  <Link to="/app/cards" aria-label="Card"><Zap size={17} fill="#fff" strokeWidth={0} /></Link>
                  {d.vaults.slice(0, 3).map((v) => <Link key={v.id} to={`/app/vaults/${v.id}`} aria-label={`${v.name} vault`}>{v.emoji}</Link>)}
                  {d.vaults.length === 0 && <Link to="/app/vaults" aria-label="Create a vault">🔐</Link>}
                </>} />
            </section>

            <nav className="actions" aria-label="Quick actions">
              <button className="action" onClick={() => setSheet('pay')}><span className="ico"><ScanLine size={24} /></span>scan &amp; pay</button>
              <button className="action" onClick={() => setSheet('add')}><span className="ico"><Plus size={24} /></span>add money</button>
              <button className="action" onClick={() => setSheet('send')}><span className="ico"><Send size={22} /></span>send</button>
              <button className="action" onClick={() => setSheet('request')}><span className="ico"><HandCoins size={23} /></span>request</button>
            </nav>

            <div className="grid2">
              <div className="card tight"><div className="row" style={{ gap: 10 }}><div className="ico-sq out"><ArrowUpRight size={18} /></div><span className="small muted">Spent this month</span></div>
                <div className="stat" style={{ marginTop: 10 }}><b><Money value={d.monthSpent} /></b><span className="tiny muted">of {inr(d.budget)} budget</span></div>
                <div style={{ marginTop: 8 }}><Bar value={pct(d.monthSpent, d.budget)} tone={d.monthSpent > d.budget ? 'red' : d.monthSpent > d.budget * 0.85 ? 'warn' : ''} label="Budget used" /></div>
              </div>
              <div className="card tight"><div className="row" style={{ gap: 10 }}><div className="ico-sq in"><ArrowDownLeft size={18} /></div><span className="small muted">Received this month</span></div>
                <div className="stat" style={{ marginTop: 10 }}><b><Money value={d.monthReceived} /></b><span className="tiny muted">{inr(d.monthSaved)} moved to vaults</span></div>
                <div style={{ marginTop: 8 }}><Bar value={pct(d.monthSaved, d.savingsTarget)} tone="green" label="Savings target reached" /></div>
              </div>
            </div>

            <section className="card" aria-labelledby="h-week">
              <div className="section-head"><h3 id="h-week">Last 7 days</h3><span className="small muted">{inr(d.weekSpent)} this week</span></div>
              {d.daily.some((x) => x.spent > 0)
                ? <Bars title="Spending per day over the last 7 days" data={d.daily.map((x) => ({ label: x.label, values: [x.spent] }))} series={[{ name: 'Spent', color: SERIES.spent }]} height={140} />
                : <Empty emoji="🌤️" title="No spending yet" body="Payments you make will show up here." />}
            </section>

            <section className="card" aria-labelledby="h-recent">
              <div className="section-head"><h3 id="h-recent">Recent activity</h3><Link className="link" to="/app/wallet">See all</Link></div>
              {d.recent.length ? <div className="list">{d.recent.map((t) => <TxnRow key={t.id} t={t} />)}</div>
                : <Empty emoji="💸" title="Nothing here yet" body="Add some demo money to get started." action={<button className="btn primary sm" onClick={() => setSheet('add')}>Add money</button>} />}
            </section>
          </div>

          <div className="stack">
            <Link to="/app/rewards" className="card glow press" aria-label="Rewards and XP">
              <div className="row">
                <Ring value={d.level.progress} size={74} label={`Level progress ${Math.round(d.level.progress * 100)}%`}><b className="num" style={{ fontSize: 22 }}>{d.level.level}</b></Ring>
                <div className="grow">
                  <div className="up">Level {d.level.level} · {d.level.title}</div>
                  <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{d.level.xp.toLocaleString('en-IN')} XP</div>
                  <div className="small t2">{d.level.toNext} XP to level {d.level.level + 1} · 🪙 {d.coins} coins</div>
                </div>
                <ChevronRight size={20} className="muted" />
              </div>
              {!d.checkedInToday && <div className="badge-pill green" style={{ marginTop: 12 }}><Flame size={12} /> Check in today to keep your streak</div>}
              {d.claimable > 0 && <div className="badge-pill green" style={{ marginTop: 12, marginLeft: 6 }}>🎁 {d.claimable} reward{d.claimable > 1 ? 's' : ''} to claim</div>}
            </Link>

            <section className="card" aria-labelledby="h-miss">
              <div className="section-head"><h3 id="h-miss">Missions</h3><Link className="link" to="/app/rewards">All missions</Link></div>
              <div className="col" style={{ gap: 14 }}>
                {d.missions.map((m) => (
                  <div key={m.key}>
                    <div className="row between small"><span style={{ fontWeight: 650 }}>{m.title}</span><span className="green num">+{m.xp} XP</span></div>
                    <div style={{ margin: '7px 0 4px' }}><Bar value={m.progress * 100} tone={m.status === 'failed' ? 'red' : m.status === 'claimable' ? 'green' : ''} label={m.title} /></div>
                    <div className="tiny muted">{m.status === 'claimable' ? 'Complete! Claim your reward.' : m.status === 'failed' ? 'Over the limit this week.' : m.unit === 'money' ? `${inr(m.current)} of ${inr(m.target)}` : `${m.current} of ${m.target}`}</div>
                  </div>
                ))}
                {!d.missions.length && <p className="muted small">All missions claimed. New ones drop on Monday.</p>}
              </div>
            </section>

            <section className="card" aria-labelledby="h-save">
              <div className="section-head"><h3 id="h-save">Savings vaults</h3><Link className="link" to="/app/vaults">Open</Link></div>
              {d.vaults.length ? <>
                <div className="row" style={{ marginBottom: 14 }}>
                  <Ring value={d.totalTarget ? d.totalSaved / d.totalTarget : 0} size={64}><span className="num small" style={{ fontWeight: 700 }}>{pct(d.totalSaved, d.totalTarget)}%</span></Ring>
                  <div><div className="num" style={{ fontSize: 22, fontWeight: 700 }}><Money value={d.totalSaved} /></div><div className="small muted">saved of {inr(d.totalTarget)} across {d.vaults.length} goals</div></div>
                </div>
                <div className="col" style={{ gap: 10 }}>
                  {d.vaults.slice(0, 3).map((v) => (
                    <Link key={v.id} to={`/app/vaults/${v.id}`} className="row small">
                      <span aria-hidden>{v.emoji}</span><span className="grow truncate">{v.name}</span><span className="muted num">{pct(v.saved, v.target)}%</span>
                      <span style={{ width: 70 }}><Bar value={pct(v.saved, v.target)} tone="green" label={`${v.name} progress`} /></span>
                    </Link>
                  ))}
                </div>
              </> : <Empty emoji="🔐" title="No vaults yet" body="Create a goal and start stashing." action={<Link className="btn primary sm" to="/app/vaults">Create a vault</Link>} />}
            </section>

            <Link to="/app/assistant" className="card press" aria-label="Financial health">
              <div className="row">
                <Ring value={d.health.score / 100} size={64} color={d.health.score >= 60 ? 'var(--green)' : 'var(--warn)'} label={`Financial health ${d.health.score} of 100`}><b className="num">{d.health.score}</b></Ring>
                <div className="grow"><div className="up">Financial health</div><div style={{ fontFamily: 'var(--display)', fontWeight: 650, fontSize: 18 }}>{d.health.label}</div>
                  <div className="small muted">{d.health.parts.slice().sort((a, b) => a.score / a.max - b.score / b.max)[0]?.hint}</div></div>
                <ChevronRight size={20} className="muted" />
              </div>
            </Link>

            {d.topInsight && (
              <Link to="/app/assistant" className="card press">
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <div className="ico-sq out"><Sparkles size={18} /></div>
                  <div className="grow"><div className="up">Money coach</div><div style={{ fontWeight: 650 }}>{d.topInsight.title}</div><div className="small muted">{d.topInsight.body}</div></div>
                </div>
              </Link>
            )}
          </div>
        </div>
        );
      }}</Load>
      {sheet && <MoneySheet kind={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

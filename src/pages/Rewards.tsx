import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Flame, Lock } from 'lucide-react';
import { api, errMsg, type BadgeT, type Level, type Mission } from '../api';
import { useAfter, useToast } from '../ctx';
import { Bar, Button, Empty, Load, PageHead, Ring, Sheet, Success, Tabs } from '../ui';
import { ago, fmtDate, inr, until } from '../lib';

interface LB { name: string; avatar: string; xp: number; you: boolean; rank: number }
interface Store { key: string; name: string; desc: string; cost: number; emoji: string; kind: string; owned: boolean }
interface RewardsData {
  level: Level; coins: number; streak: number; checkedInToday: boolean; week: { label: string; day: string; done: boolean; today: boolean }[];
  missions: Mission[]; badges: BadgeT[]; leaderboard: { week: LB[]; allTime: LB[] }; store: Store[];
  redemptions: { id: string; name: string; emoji: string; cost: number; code: string; createdAt: number }[]; activity: { xp: number; coins: number; reason: string; createdAt: number }[];
}
type Tab = 'missions' | 'badges' | 'league' | 'store';

function MissionCard({ m, onClaim, busy }: { m: Mission; onClaim: () => void; busy: boolean }) {
  const text = m.inverse ? `${inr(m.current)} spent of ${inr(m.target)} limit` : m.unit === 'money' ? `${inr(Math.min(m.current, m.target))} of ${inr(m.target)}` : `${Math.min(m.current, m.target)} of ${m.target}`;
  return (
    <div className="card tight" style={m.status === 'claimable' ? { borderColor: 'rgba(57,255,156,.5)', background: 'rgba(57,255,156,.06)' } : m.status === 'claimed' ? { opacity: 0.6 } : undefined}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="grow"><div style={{ fontWeight: 700 }}>{m.title}</div><div className="small muted">{m.desc}</div></div>
        <div style={{ textAlign: 'right' }}><div className="num green" style={{ fontWeight: 700 }}>+{m.xp} XP</div><div className="tiny muted">🪙 {m.coins}</div></div>
      </div>
      <div style={{ margin: '12px 0 6px' }}><Bar value={m.progress * 100} tone={m.status === 'failed' ? 'red' : m.status === 'claimable' || m.status === 'claimed' ? 'green' : ''} label={`${m.title} progress`} /></div>
      <div className="row between">
        <span className="small t2">{text}{m.endsAt && m.status === 'in_progress' ? ` · ${until(m.endsAt)}` : ''}</span>
        {m.status === 'claimable' ? <Button size="sm" loading={busy} onClick={onClaim}>Claim</Button>
          : m.status === 'claimed' ? <span className="badge-pill green"><Check size={12} /> Claimed</span>
          : m.status === 'failed' ? <span className="badge-pill red">Missed this week</span>
          : m.inverse ? <span className="badge-pill purple">On track</span> : null}
      </div>
    </div>
  );
}

export function Rewards() {
  const q = useQuery({ queryKey: ['rewards'], queryFn: () => api<RewardsData>('/rewards') });
  const after = useAfter(), toast = useToast();
  const [tab, setTab] = useState<Tab>('missions');
  const [league, setLeague] = useState<'week' | 'allTime'>('week');
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState<Store | null>(null);
  const [redeemed, setRedeemed] = useState<{ code: string; kind: string; name: string } | null>(null);
  const [badge, setBadge] = useState<BadgeT | null>(null);

  async function run(key: string, fn: () => Promise<any>, ok: (r: any) => void) {
    setBusy(key);
    try { const r = await fn(); after(r); ok(r); } catch (e) { toast({ kind: 'error', text: errMsg(e) }); } finally { setBusy(''); }
  }
  const checkIn = () => run('checkin', () => api('/rewards/checkin', { method: 'POST' }), (r) => toast({ kind: 'reward', emoji: '🔥', text: `${r.streak}-day streak!`, sub: `+${r.reward.xp} XP · +${r.reward.coins} coins` }));
  const claim = (m: Mission) => run(m.key, () => api(`/rewards/missions/${m.key}/claim`, { method: 'POST' }), (r) => toast({ kind: 'reward', emoji: '🎯', text: 'Mission complete', sub: `+${r.reward.xp} XP · +${r.reward.coins} coins` }));
  const redeem = (s: Store) => run(s.key, () => api('/rewards/redeem', { body: { key: s.key } }), (r) => { setConfirm(null); setRedeemed(r); });

  return (
    <div className="page">
      <PageHead title="Rewards" />
      <Load q={q}>{(d) => {
        const groups: [string, Mission[]][] = [['Weekly missions', d.missions.filter((m) => m.group === 'weekly')], ['Monthly mission', d.missions.filter((m) => m.group === 'monthly')], ['Savings challenges', d.missions.filter((m) => m.group === 'challenge')]];
        const earned = d.badges.filter((b) => b.earnedAt).length;
        return (
          <div className="cols">
            <div className="stack">
              <section className="card glow" aria-label="Level and XP">
                <div className="row" style={{ gap: 18 }}>
                  <Ring value={d.level.progress} size={108} stroke={9} label={`Level ${d.level.level}, ${Math.round(d.level.progress * 100)}% to next level`}>
                    <div style={{ textAlign: 'center' }}><div className="tiny muted">LEVEL</div><b className="num" style={{ fontSize: 34, lineHeight: 1 }}>{d.level.level}</b></div>
                  </Ring>
                  <div className="grow">
                    <div className="grad-text" style={{ fontFamily: 'var(--display)', fontWeight: 750, fontSize: 26 }}>{d.level.title}</div>
                    <div className="num" style={{ fontSize: 18, fontWeight: 650 }}>{d.level.xp.toLocaleString('en-IN')} XP</div>
                    <div className="small t2">{d.level.toNext} XP to level {d.level.level + 1}</div>
                    <div className="row wrap" style={{ marginTop: 10, gap: 6 }}><span className="badge-pill">🪙 {d.coins} coins</span><span className="badge-pill">🏅 {earned}/{d.badges.length} badges</span></div>
                  </div>
                </div>
              </section>

              <section className="card" aria-labelledby="r-streak">
                <div className="section-head"><h3 id="r-streak"><Flame size={17} style={{ verticalAlign: -3, color: '#ff8a3d' }} /> {d.streak}-day streak</h3><span className="small muted">Bonus every 7 days</span></div>
                <div className="streak-days" aria-label="This week's check-ins">
                  {d.week.map((w, i) => <div key={i} className={`${w.done ? 'done' : ''} ${w.today ? 'today' : ''}`}><i aria-label={`${w.day}: ${w.done ? 'checked in' : 'not checked in'}`}>{w.done ? '🔥' : ''}</i>{w.label}</div>)}
                </div>
                <Button block variant={d.checkedInToday ? 'ghost' : 'primary'} disabled={d.checkedInToday} loading={busy === 'checkin'} onClick={checkIn} style={{ marginTop: 14 }}>
                  {d.checkedInToday ? '✓ Checked in today' : "I've reviewed today's spending · +20 XP"}
                </Button>
              </section>

              <Tabs label="Rewards sections" value={tab} onChange={setTab} options={[{ value: 'missions', label: 'Missions' }, { value: 'badges', label: 'Badges' }, { value: 'league', label: 'League' }, { value: 'store', label: 'Store' }]} />

              {tab === 'missions' && groups.map(([title, ms]) => (
                <section key={title} aria-label={title} className="col"><div className="up">{title}</div>{ms.map((m) => <MissionCard key={m.key} m={m} busy={busy === m.key} onClaim={() => claim(m)} />)}</section>
              ))}

              {tab === 'badges' && (
                <div className="badge-grid">
                  {d.badges.map((b) => (
                    <button key={b.key} className={`badge ${b.earnedAt ? '' : 'locked'}`} onClick={() => setBadge(b)} aria-label={`${b.name}${b.earnedAt ? ', earned' : ', locked'}`}>
                      <span className="em" aria-hidden>{b.earnedAt ? b.emoji : <Lock size={20} />}</span><span className="small" style={{ fontWeight: 700 }}>{b.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {tab === 'league' && (
                <section className="card" aria-label="Leaderboard">
                  <div className="row between" style={{ marginBottom: 12 }}>
                    <div><h3>Neon League</h3><p className="tiny muted">Demo league with scripted players</p></div>
                    <div style={{ width: 190 }}><Tabs label="Leaderboard period" value={league} onChange={setLeague} options={[{ value: 'week', label: 'Week' }, { value: 'allTime', label: 'All time' }]} /></div>
                  </div>
                  <ol style={{ listStyle: 'none', margin: 0, padding: 0 }} className="col">
                    {d.leaderboard[league].map((r) => (
                      <li key={r.name} className={`lb-row ${r.you ? 'you' : ''}`}>
                        <span className="rank">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span><span className="avatar sm" aria-hidden>{r.avatar}</span>
                        <span className="grow truncate" style={{ fontWeight: 650 }}>{r.you ? 'You' : r.name}</span><span className="num" style={{ fontWeight: 700 }}>{r.xp.toLocaleString('en-IN')} XP</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {tab === 'store' && (
                <>
                  <div className="grid2">
                    {d.store.map((s) => (
                      <div key={s.key} className="card tight col" style={{ gap: 8 }}>
                        <div style={{ fontSize: 30 }} aria-hidden>{s.emoji}</div>
                        <div className="grow"><div style={{ fontWeight: 700 }}>{s.name}</div><div className="tiny muted">{s.desc}</div></div>
                        <Button size="sm" variant={s.owned ? 'ghost' : d.coins >= s.cost ? 'purple' : 'ghost'} disabled={s.owned || d.coins < s.cost} onClick={() => setConfirm(s)}>
                          {s.owned ? 'Owned' : d.coins >= s.cost ? `🪙 ${s.cost}` : `Need ${s.cost - d.coins} more`}
                        </Button>
                      </div>
                    ))}
                  </div>
                  <p className="hint">Store rewards are demo items. Vouchers can't be used with real merchants.</p>
                  {d.redemptions.length > 0 && (
                    <section className="card" aria-labelledby="r-red"><div className="section-head"><h3 id="r-red">Your redemptions</h3></div>
                      <div className="list">{d.redemptions.map((r) => (
                        <div key={r.id} className="item"><span className="avatar" aria-hidden>{r.emoji}</span><div className="grow"><div style={{ fontWeight: 650 }}>{r.name}</div><div className="small muted">{fmtDate(r.createdAt)} · 🪙 {r.cost}</div></div><code className="badge-pill">{r.code}</code></div>
                      ))}</div>
                    </section>
                  )}
                </>
              )}
            </div>

            <div className="stack">
              <section className="card" aria-labelledby="r-act">
                <div className="section-head"><h3 id="r-act">XP activity</h3></div>
                {d.activity.length ? <div className="list">{d.activity.map((a, i) => (
                  <div key={i} className="item"><div className="ico-sq in">⚡</div><div className="grow"><div className="truncate" style={{ fontWeight: 650 }}>{a.reason}</div><div className="small muted">{ago(a.createdAt)}</div></div><span className="num green" style={{ fontWeight: 700 }}>+{a.xp}</span></div>
                ))}</div> : <Empty emoji="⚡" title="No XP yet" body="Check in or finish a mission to earn your first XP." />}
              </section>
              <section className="card"><h3>How it works</h3>
                <ul className="small t2" style={{ paddingLeft: 18, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <li><b>XP</b> raises your level. It never goes down.</li><li><b>Coins</b> come with XP and can be spent in the store.</li>
                  <li>Check in daily to grow your streak. Every 7th day pays a 50 XP bonus.</li><li>Weekly missions reset every Monday.</li>
                </ul>
              </section>
            </div>
          </div>
        );
      }}</Load>

      {confirm && (
        <Sheet title="Redeem reward" onClose={() => setConfirm(null)}>
          <div className="col" style={{ textAlign: 'center', gap: 14 }}>
            <div style={{ fontSize: 56 }} aria-hidden>{confirm.emoji}</div><h2>{confirm.name}</h2><p className="t2">{confirm.desc}</p>
            <p className="muted small">This will use 🪙 {confirm.cost} of your {q.data?.coins} coins.</p>
            <Button block variant="purple" loading={busy === confirm.key} onClick={() => redeem(confirm)}>Redeem for 🪙 {confirm.cost}</Button>
            <Button block variant="ghost" onClick={() => setConfirm(null)}>Not now</Button>
          </div>
        </Sheet>
      )}
      {redeemed && (
        <Sheet title="Redeemed" onClose={() => setRedeemed(null)}>
          <Success title={redeemed.name} body={redeemed.kind === 'wallet' ? 'Demo credit added to your wallet.' : redeemed.kind === 'skin' ? 'Holo is now available in Cards → Card design.' : 'Here is your demo voucher code.'}>
            {redeemed.kind === 'voucher' && <button className="card tight num" style={{ fontSize: 22, letterSpacing: '.08em', textAlign: 'center' }} onClick={() => { navigator.clipboard?.writeText(redeemed.code); toast({ kind: 'ok', text: 'Code copied' }); }} aria-label={`Copy code ${redeemed.code}`}>{redeemed.code}</button>}
            <Button block onClick={() => setRedeemed(null)}>Nice</Button>
          </Success>
        </Sheet>
      )}
      {badge && (
        <Sheet title="Badge" onClose={() => setBadge(null)}>
          <div className="col" style={{ textAlign: 'center', alignItems: 'center', gap: 10 }}>
            <div className={`badge ${badge.earnedAt ? '' : 'locked'}`} style={{ border: 0, background: 'none' }}><span className="em" style={{ width: 96, height: 96, fontSize: 48 }} aria-hidden>{badge.emoji}</span></div>
            <h2>{badge.name}</h2><p className="t2">{badge.desc}</p>
            <span className={`badge-pill ${badge.earnedAt ? 'green' : ''}`}>{badge.earnedAt ? `Earned ${fmtDate(badge.earnedAt)}` : 'Not earned yet'}</span>
            <Button block variant="ghost" onClick={() => setBadge(null)} style={{ marginTop: 8 }}>Close</Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

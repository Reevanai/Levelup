import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { HandCoins, Plus, ScanLine, Search, Send, Copy } from 'lucide-react';
import { api, errMsg, type Cat, type Txn } from '../api';
import { useAfter, useToast } from '../ctx';
import { Button, Empty, ErrorState, Load, PageHead, Private, Skeleton, TxnRow } from '../ui';
import { CategoryLegend, Donut } from '../charts';
import { ago, dayLabel, inr } from '../lib';
import { MoneySheet, type MoneySheetKind } from '../sheets';
import { CATEGORIES } from '../../shared/constants';

interface WalletData {
  balance: number; handle: string; monthSpent: number; monthReceived: number; categories: Cat[]; hasParent: boolean;
  requests: { id: string; fromName: string; fromHandle: string; amount: number; note: string | null; status: string; viaParent: boolean; createdAt: number }[];
}
const STATUS: Record<string, string> = { pending: 'warn', paid: 'green', declined: 'red', cancelled: '' };

export function Wallet() {
  const q = useQuery({ queryKey: ['wallet'], queryFn: () => api<WalletData>('/wallet') });
  const [sheet, setSheet] = useState<MoneySheetKind | null>(null);
  const [dir, setDir] = useState<'' | 'credit' | 'debit'>('');
  const [cat, setCat] = useState('');
  const [search, setSearch] = useState(''); const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 250); return () => clearTimeout(t); }, [search]);
  const after = useAfter(); const toast = useToast();
  const [acting, setActing] = useState('');

  const txns = useInfiniteQuery({
    queryKey: ['txns', dir, cat, term],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ limit: '25' });
      if (pageParam) p.set('before', String(pageParam)); if (dir) p.set('direction', dir); if (cat) p.set('category', cat); if (term) p.set('q', term);
      return api<{ items: Txn[]; nextBefore: number | null }>(`/transactions?${p}`);
    },
    initialPageParam: 0, getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const items = txns.data?.pages.flatMap((p) => p.items) ?? [];
  const groups = items.reduce<{ day: string; rows: Txn[] }[]>((acc, t) => { const day = dayLabel(t.createdAt); const g = acc[acc.length - 1]; if (g?.day === day) g.rows.push(t); else acc.push({ day, rows: [t] }); return acc; }, []);

  async function act(id: string, action: 'simulate' | 'cancel') {
    setActing(id);
    try { const r = await api(`/wallet/requests/${id}/${action}`, { method: 'POST' }); after(r); toast({ kind: 'ok', text: action === 'simulate' ? 'Request paid (simulated)' : 'Request cancelled' }); }
    catch (e) { toast({ kind: 'error', text: errMsg(e) }); } finally { setActing(''); }
  }

  return (
    <div className="page">
      <PageHead title="Wallet" right={<span className="demo-flag">Simulated</span>} />
      <div className="cols">
        <div className="stack">
          <Load q={q} skeleton={<Skeleton h={190} r={26} />}>{(d) => (
            <>
              <section className="hero" aria-label="Wallet balance">
                <span className="sub">LevelUp Wallet</span>
                <div className="balance"><Private value={d.balance} /></div>
                <button className="row sub" style={{ gap: 6, marginTop: 8 }} onClick={() => { navigator.clipboard?.writeText(d.handle); toast({ kind: 'ok', text: 'Handle copied' }); }} aria-label={`Copy your handle ${d.handle}`}>
                  {d.handle} <Copy size={13} />
                </button>
                <div className="grid2" style={{ marginTop: 16 }}>
                  <div className="stat"><span className="sub">In this month</span><b>+{inr(d.monthReceived)}</b></div>
                  <div className="stat"><span className="sub">Out this month</span><b>−{inr(d.monthSpent)}</b></div>
                </div>
              </section>
              <nav className="actions" aria-label="Wallet actions">
                <button className="action hot" onClick={() => setSheet('add')}><span className="ico"><Plus size={22} /></span>Add</button>
                <button className="action" onClick={() => setSheet('send')}><span className="ico"><Send size={20} /></span>Send</button>
                <button className="action" onClick={() => setSheet('request')}><span className="ico"><HandCoins size={21} /></span>Request</button>
                <button className="action" onClick={() => setSheet('pay')}><span className="ico"><ScanLine size={21} /></span>Pay</button>
              </nav>

              {d.requests.length > 0 && (
                <section className="card" aria-labelledby="w-req">
                  <div className="section-head"><h3 id="w-req">Requests</h3></div>
                  <div className="list">
                    {d.requests.slice(0, 5).map((r) => (
                      <div className="item" key={r.id} style={{ flexWrap: 'wrap' }}>
                        <div className="avatar" aria-hidden>{r.viaParent ? '🦉' : '🙋'}</div>
                        <div className="grow"><div style={{ fontWeight: 650 }}>{inr(r.amount)} from {r.fromName}</div><div className="small muted truncate">{r.note ?? 'Money request'} · {ago(r.createdAt)}</div></div>
                        <span className={`badge-pill ${STATUS[r.status]}`}>{r.status === 'pending' && r.viaParent ? 'Awaiting parent' : r.status}</span>
                        {r.status === 'pending' && (
                          <div className="row" style={{ width: '100%', paddingLeft: 56, gap: 8 }}>
                            {!r.viaParent && <Button size="sm" variant="purple" loading={acting === r.id} onClick={() => act(r.id, 'simulate')}>Simulate payment</Button>}
                            <Button size="sm" variant="ghost" disabled={acting === r.id} onClick={() => act(r.id, 'cancel')}>Cancel</Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}</Load>

          <section className="card" aria-labelledby="w-hist">
            <div className="section-head"><h3 id="w-hist">Transaction history</h3></div>
            <div className="col" style={{ gap: 10, marginBottom: 6 }}>
              <div style={{ position: 'relative' }}>
                <Search size={17} style={{ position: 'absolute', left: 14, top: 16, color: 'var(--muted)' }} aria-hidden />
                <input className="input" style={{ paddingLeft: 40 }} type="search" placeholder="Search transactions" aria-label="Search transactions" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="chips scroll" role="group" aria-label="Filter transactions">
                {([['', 'All'], ['credit', 'Money in'], ['debit', 'Money out']] as const).map(([v, l]) => <button key={v} className="chip" aria-pressed={dir === v && !cat} onClick={() => { setDir(v); setCat(''); }}>{l}</button>)}
                {CATEGORIES.map((c) => <button key={c.key} className="chip" aria-pressed={cat === c.key} onClick={() => { setCat(cat === c.key ? '' : c.key); setDir(''); }}>{c.emoji} {c.label}</button>)}
              </div>
            </div>
            {txns.isLoading ? <div className="col"><Skeleton h={56} /><Skeleton h={56} /><Skeleton h={56} /></div>
              : txns.error ? <ErrorState error={txns.error} retry={() => txns.refetch()} />
              : !items.length ? <Empty emoji={term || cat || dir ? '🔎' : '💸'} title={term || cat || dir ? 'No matching transactions' : 'No transactions yet'} body={term || cat || dir ? 'Try a different filter or search.' : 'Add demo money to make your first move.'} />
              : <>
                {groups.map((g) => (<div key={g.day}><div className="up" style={{ padding: '12px 4px 2px' }}>{g.day}</div><div className="list">{g.rows.map((t) => <TxnRow key={t.id} t={t} />)}</div></div>))}
                {txns.hasNextPage && <Button variant="ghost" block loading={txns.isFetchingNextPage} onClick={() => txns.fetchNextPage()} style={{ marginTop: 12 }}>Load more</Button>}
              </>}
          </section>
        </div>

        <div className="stack">
          <Load q={q} skeleton={<Skeleton h={220} r={26} />}>{(d) => (
            <section className="card" aria-labelledby="w-cat">
              <div className="section-head"><h3 id="w-cat">Spending categories</h3><span className="small muted">This month</span></div>
              {d.monthSpent > 0
                ? <div className="donut-wrap"><Donut data={d.categories} /><CategoryLegend data={d.categories} /></div>
                : <Empty emoji="🍩" title="Nothing spent this month" body="Your category breakdown appears after your first payment." />}
            </section>
          )}</Load>
          <div className="notice"><span>Wallet balances here are demo credits, not deposits. In a live product, balances would be held by a licensed prepaid instrument or banking partner.</span></div>
        </div>
      </div>
      {sheet && <MoneySheet kind={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Copy, Printer, Share2 } from 'lucide-react';
import { api, type Txn } from '../api';
import { useToast } from '../ctx';
import { Button, Load, PageHead, Skeleton } from '../ui';
import { fmtDate, fmtTime, inr, txnVisual } from '../lib';

export function TxnDetail() {
  const { id } = useParams();
  const toast = useToast();
  const q = useQuery({ queryKey: ['txn', id], queryFn: () => api<{ txn: Txn; holder: string; handle: string }>(`/transactions/${id}`) });
  return (
    <div className="page" style={{ maxWidth: 560, margin: '0 auto' }}>
      <PageHead title="Receipt" back="/app/wallet" />
      <Load q={q} skeleton={<Skeleton h={420} r={26} />}>{({ txn: t, holder, handle }) => {
        const v = txnVisual(t), credit = t.direction === 'credit', ok = t.status === 'success';
        const summary = `LevelUp receipt (simulated)\n${t.title}\n${credit ? '+' : '-'}${inr(t.amount)} · ${fmtDate(t.createdAt)} ${fmtTime(t.createdAt)}\nRef ${t.ref}`;
        const share = async () => {
          if (navigator.share) { try { await navigator.share({ title: 'LevelUp receipt', text: summary }); } catch { /* dismissed */ } }
          else { await navigator.clipboard?.writeText(summary); toast({ kind: 'ok', text: 'Receipt copied to clipboard' }); }
        };
        return (
          <div className="stack">
            <article className="receipt" aria-label="Transaction receipt">
              <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 8 }}>
                <div className="avatar lg" aria-hidden>{v.emoji}</div>
                <div className="muted small">{credit ? 'Received' : t.kind === 'vault' ? 'Moved to savings' : 'Paid'}</div>
                <div className="num" style={{ fontSize: 40, fontWeight: 750, textDecoration: ok ? undefined : 'line-through', color: !ok ? 'var(--muted)' : credit ? 'var(--green)' : undefined }}>{credit ? '+' : '−'}{inr(t.amount)}</div>
                <h2>{t.title}</h2>
                <span className={`badge-pill ${ok ? 'green' : 'red'}`}>{ok ? '● Successful' : '● Declined'}</span>
                {!ok && t.note && <p className="small" style={{ color: '#ffc2cb' }}>{t.note}</p>}
              </div>
              <div className="tear" />
              <dl>
                <dt>Date</dt><dd>{fmtDate(t.createdAt)}, {fmtTime(t.createdAt)}</dd>
                <dt>Type</dt><dd>{v.label}</dd>
                {t.subtitle && <><dt>Details</dt><dd>{t.subtitle}</dd></>}
                {ok && t.note && <><dt>Note</dt><dd>{t.note}</dd></>}
                <dt>Method</dt><dd>{t.method}</dd>
                <dt>Account</dt><dd>{holder} · {handle}</dd>
                {ok && <><dt>Balance after</dt><dd className="num">{inr(t.balanceAfter)}</dd></>}
                <dt>Reference</dt>
                <dd><button className="row" style={{ gap: 6, marginLeft: 'auto', fontWeight: 600 }} onClick={() => { navigator.clipboard?.writeText(t.ref); toast({ kind: 'ok', text: 'Reference copied' }); }} aria-label="Copy reference">
                  <span className="num small">{t.ref}</span><Copy size={13} className="no-print" /></button></dd>
              </dl>
              <div className="tear" />
              <p className="tiny muted" style={{ textAlign: 'center' }}>Simulated transaction for demonstration. No real money moved. Not a payment confirmation.</p>
            </article>
            <div className="grid2 no-print">
              <Button variant="ghost" onClick={share}><Share2 size={17} /> Share</Button>
              <Button variant="ghost" onClick={() => window.print()}><Printer size={17} /> Print / PDF</Button>
            </div>
            {t.vaultId && <Link to={`/app/vaults/${t.vaultId}`} className="btn ghost block no-print">Open vault</Link>}
          </div>
        );
      }}</Load>
    </div>
  );
}

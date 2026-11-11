import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUp, Check, ChevronLeft, ChevronRight, Printer, X } from 'lucide-react';
import { api, errMsg, type Cat, type Health, type Insight } from '../api';
import { useAfter, useToast } from '../ctx';
import { Bar, Button, Empty, Load, PageHead, Sheet, Tabs } from '../ui';
import { Bars, CategoryLegend, Donut, Gauge, SERIES } from '../charts';
import { fmtDate, inr, pct } from '../lib';

interface Quiz { key: string; title: string; emoji: string; minutes: number; xp: number; passed: boolean; questions: { q: string; options: string[] }[] }
interface InsightsData {
  categories: Cat[]; trend: { label: string; spent: number; income: number; saved: number }[]; insights: Insight[]; suggestion: { suggested: number; reason: string };
  health: Health; budget: number; savingsTarget: number; monthSpent: number; quizzes: Quiz[];
}
interface Report {
  month: string; offset: number; income: number; spent: number; saved: number; prevSpent: number; savingsRate: number; grade: string; budget: number; categories: Cat[];
  merchants: { title: string; total: number; n: number }[]; biggest: { title: string; amount: number; created_at: number } | null; highlights: string[];
}
interface Answer { text: string; bullets: string[]; followups: string[]; link?: { label: string; to: string } }
type Tab = 'insights' | 'ask' | 'report' | 'learn';
const TONE = { good: 'green', warn: 'warn', info: 'purple' } as const;

export function Assistant() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'insights';
  const q = useQuery({ queryKey: ['insights'], queryFn: () => api<InsightsData>('/insights') });
  return (
    <div className="page">
      <PageHead title="Money coach" back="/app" sub="Built from your own spending. Not financial advice." />
      <div style={{ marginBottom: 18 }}><Tabs label="Coach sections" value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })}
        options={[{ value: 'insights', label: 'Insights' }, { value: 'ask', label: 'Ask' }, { value: 'report', label: 'Report' }, { value: 'learn', label: 'Learn' }]} /></div>
      {tab === 'ask' ? <Ask /> : tab === 'report' ? <ReportView /> : <Load q={q}>{(d) => (tab === 'insights' ? <Insights d={d} /> : <Learn quizzes={d.quizzes} />)}</Load>}
    </div>
  );
}

function Insights({ d }: { d: InsightsData }) {
  const after = useAfter(), toast = useToast();
  const hasData = d.trend.some((m) => m.spent + m.income > 0);
  if (!hasData) return <div className="card"><Empty emoji="🔭" title="Not enough data yet" body="Once you've added money and made a few payments, your coach will start spotting patterns." action={<Link to="/app/wallet" className="btn primary sm">Go to wallet</Link>} /></div>;
  return (
    <div className="cols">
      <div className="stack">
        <section className="card" aria-labelledby="a-health">
          <h3 id="a-health" className="sr">Financial health</h3>
          <Gauge score={d.health.score} label={d.health.label} />
          <div className="col" style={{ gap: 12, marginTop: 18 }}>
            {d.health.parts.map((p) => (
              <div key={p.key}><div className="row between small"><span style={{ fontWeight: 650 }}>{p.label}</span><span className="num muted">{p.score}/{p.max}</span></div>
                <div style={{ margin: '6px 0 4px' }}><Bar value={pct(p.score, p.max)} tone={p.score / p.max >= 0.7 ? 'green' : p.score / p.max >= 0.4 ? '' : 'warn'} label={p.label} /></div><div className="tiny muted">{p.hint}</div></div>
            ))}
          </div>
        </section>
        <section aria-label="What your coach noticed" className="col">
          <div className="up">What I noticed</div>
          {d.insights.map((i) => (
            <div key={i.id} className="card tight row" style={{ alignItems: 'flex-start' }}>
              <div className="avatar" aria-hidden>{i.emoji}</div>
              <div className="grow"><div className="row between" style={{ alignItems: 'flex-start', gap: 8 }}><span style={{ fontWeight: 700 }}>{i.title}</span><span className={`badge-pill ${TONE[i.tone]}`}>{i.tone === 'good' ? 'Win' : i.tone === 'warn' ? 'Watch' : 'Info'}</span></div><p className="small muted" style={{ marginTop: 4 }}>{i.body}</p></div>
            </div>
          ))}
        </section>
      </div>
      <div className="stack">
        <section className="card" aria-labelledby="a-trend"><div className="section-head"><h3 id="a-trend">Money in vs out</h3><span className="small muted">6 months</span></div>
          <Bars title="Money received and spent per month, last 6 months" data={d.trend.map((m) => ({ label: m.label, values: [m.income, m.spent] }))} series={[{ name: 'Received', color: SERIES.received }, { name: 'Spent', color: SERIES.spent }]} height={170} /></section>
        <section className="card" aria-labelledby="a-cat"><div className="section-head"><h3 id="a-cat">Where it went</h3><span className="small muted">This month</span></div>
          {d.monthSpent > 0 ? <div className="donut-wrap"><Donut data={d.categories} /><CategoryLegend data={d.categories} /></div> : <Empty emoji="🍩" title="No spending this month" />}
          <div style={{ marginTop: 14 }}><div className="row between small"><span className="muted">Budget used</span><span className="num">{inr(d.monthSpent)} / {inr(d.budget)}</span></div>
            <div style={{ marginTop: 6 }}><Bar value={pct(d.monthSpent, d.budget)} tone={d.monthSpent > d.budget ? 'red' : ''} label="Budget used" /></div></div>
        </section>
        <section className="card glow"><div className="up">Suggested savings target</div><div className="num" style={{ fontSize: 30, fontWeight: 750 }}>{inr(d.suggestion.suggested)}<span className="small muted" style={{ fontWeight: 500 }}> / month</span></div>
          <p className="small t2" style={{ margin: '6px 0 12px' }}>{d.suggestion.reason}</p>
          {d.suggestion.suggested === d.savingsTarget ? <span className="badge-pill green"><Check size={12} /> This is your current target</span>
            : <Button size="sm" onClick={async () => { try { after(await api('/me', { method: 'PATCH', body: { savingsTarget: d.suggestion.suggested } })); toast({ kind: 'ok', text: 'Savings target updated' }); } catch (e) { toast({ kind: 'error', text: errMsg(e) }); } }}>Set as my target</Button>}
        </section>
      </div>
    </div>
  );
}

function Ask() {
  const [log, setLog] = useState<({ me: string } | { bot: Answer } | { err: string })[]>([{ bot: { text: "Hey! I'm your money coach. I read your LevelUp activity and answer in plain language. What do you want to know?", bullets: [], followups: ['Where is my money going?', 'What can I cut?', 'How much should I save?', 'Can I afford ₹2,000 headphones?'] } }]);
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [log, busy]);
  async function send(question: string) {
    if (!question.trim() || busy) return;
    setText(''); setLog((l) => [...l, { me: question }]); setBusy(true);
    try { const a = await api<Answer>('/assistant/ask', { body: { question } }); setLog((l) => [...l, { bot: a }]); }
    catch (e) { setLog((l) => [...l, { err: errMsg(e) }]); } finally { setBusy(false); }
  }
  const last = log[log.length - 1];
  return (
    <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="chat" role="log" aria-live="polite" aria-label="Conversation with your money coach" style={{ minHeight: 300 }}>
        {log.map((m, i) => 'me' in m ? <div key={i} className="bubble me">{m.me}</div>
          : 'err' in m ? <div key={i} className="bubble bot" role="alert" style={{ borderColor: 'rgba(255,107,129,.5)' }}>{m.err}</div>
          : <div key={i} className="bubble bot"><div>{m.bot.text}</div>{m.bot.bullets.length > 0 && <ul>{m.bot.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}{m.bot.link && <Link className="link" style={{ display: 'inline-block', marginTop: 8 }} to={m.bot.link.to}>{m.bot.link.label} →</Link>}</div>)}
        {busy && <div className="bubble bot" aria-label="Coach is typing"><span className="typing"><i /><i /><i /></span></div>}
        <div ref={end} />
      </div>
      {!busy && last && 'bot' in last && <div className="chips" style={{ margin: '14px 0 0' }}>{last.bot.followups.map((f) => <button key={f} className="chip" onClick={() => send(f)}>{f}</button>)}</div>}
      <form className="row" style={{ marginTop: 14 }} onSubmit={(e: FormEvent) => { e.preventDefault(); send(text); }}>
        <input className="input grow" placeholder="Ask about your money…" aria-label="Your question" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="icon-btn" style={{ background: 'var(--green)', color: 'var(--green-ink)', width: 50, height: 50 }} aria-label="Send" disabled={!text.trim() || busy}><ArrowUp size={22} /></button>
      </form>
      <p className="tiny muted" style={{ marginTop: 10 }}>Answers come from simple rules applied to your demo activity. They are educational, not financial advice.</p>
    </div>
  );
}

function ReportView() {
  const [offset, setOffset] = useState(0);
  const q = useQuery({ queryKey: ['report', offset], queryFn: () => api<Report>(`/report?offset=${offset}`) });
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="row between no-print" style={{ marginBottom: 14 }}>
        <button className="icon-btn" aria-label="Previous month" disabled={offset <= -11} onClick={() => setOffset(offset - 1)}><ChevronLeft size={20} /></button>
        <h2 aria-live="polite">{q.data?.month ?? '…'}</h2>
        <button className="icon-btn" aria-label="Next month" disabled={offset >= 0} onClick={() => setOffset(offset + 1)} style={{ opacity: offset >= 0 ? 0.35 : 1 }}><ChevronRight size={20} /></button>
      </div>
      <Load q={q}>{(r) => r.income + r.spent === 0 ? <div className="card"><Empty emoji="📭" title={`No activity in ${r.month}`} body="Pick another month, or come back once you've used your wallet." /></div> : (
        <div className="stack">
          <section className="card glow row" style={{ gap: 18 }}>
            <div style={{ width: 84, height: 84, borderRadius: 26, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.2)', flex: 'none' }}><span className="num grad-text" style={{ fontSize: 46, fontWeight: 800 }} aria-label={`Grade ${r.grade}`}>{r.grade}</span></div>
            <div><div className="up">Monthly report · {r.month}</div><h2 style={{ marginTop: 4 }}>{r.grade === 'A' ? 'Outstanding month' : r.grade === 'B' ? 'Solid month' : r.grade === 'C' ? 'Room to grow' : 'Tough month'}</h2><p className="small t2">Savings rate {Math.round(r.savingsRate * 100)}% · {r.spent <= r.budget ? 'inside budget' : 'over budget'}</p></div>
          </section>
          <div className="grid3">
            <div className="card tight stat"><span className="tiny muted">Received</span><b className="green">{inr(r.income)}</b></div>
            <div className="card tight stat"><span className="tiny muted">Spent</span><b>{inr(r.spent)}</b></div>
            <div className="card tight stat"><span className="tiny muted">Saved</span><b>{inr(r.saved)}</b></div>
          </div>
          <section className="card"><h3>Highlights</h3><ul className="t2" style={{ paddingLeft: 18, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>{r.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul></section>
          {r.categories.length > 0 && <section className="card"><div className="section-head"><h3>By category</h3></div><div className="donut-wrap"><Donut data={r.categories} /><CategoryLegend data={r.categories} limit={8} /></div></section>}
          {r.merchants.length > 0 && <section className="card"><div className="section-head"><h3>Top places</h3></div><div className="list">{r.merchants.map((m, i) => (
            <div key={m.title} className="item"><span className="rank num muted" style={{ width: 22 }}>{i + 1}</span><div className="grow"><div style={{ fontWeight: 650 }}>{m.title}</div><div className="small muted">{m.n} payment{m.n > 1 ? 's' : ''}</div></div><span className="num" style={{ fontWeight: 650 }}>{inr(m.total)}</span></div>))}</div>
            {r.biggest && <p className="small muted" style={{ marginTop: 10 }}>Biggest single payment: {inr(r.biggest.amount)} at {r.biggest.title} on {fmtDate(r.biggest.created_at)}.</p>}</section>}
          <Button variant="ghost" block className="no-print" onClick={() => window.print()}><Printer size={17} /> Print or save as PDF</Button>
        </div>
      )}</Load>
    </div>
  );
}

function Learn({ quizzes }: { quizzes: Quiz[] }) {
  const [open, setOpen] = useState<Quiz | null>(null);
  const passed = quizzes.filter((q) => q.passed).length;
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }} className="stack">
      <section className="card glow"><div className="up">Financial literacy challenges</div><h2 style={{ margin: '4px 0 10px' }}>{passed} of {quizzes.length} completed</h2><Bar value={pct(passed, quizzes.length)} tone="green" label="Quizzes completed" /></section>
      {quizzes.map((q) => (
        <button key={q.key} className="card press row" onClick={() => setOpen(q)}>
          <span className="avatar" aria-hidden>{q.emoji}</span>
          <span className="grow"><span style={{ display: 'block', fontWeight: 700 }}>{q.title}</span><span className="small muted">{q.questions.length} questions · {q.minutes} min</span></span>
          {q.passed ? <span className="badge-pill green"><Check size={12} /> Passed</span> : <span className="badge-pill purple">+{q.xp} XP</span>}
        </button>
      ))}
      {open && <QuizSheet quiz={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function QuizSheet({ quiz, onClose }: { quiz: Quiz; onClose: () => void }) {
  const after = useAfter(), toast = useToast();
  const [answers, setAnswers] = useState<number[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [result, setResult] = useState<{ score: number; total: number; passed: boolean; results: { correct: boolean; answer: number; why: string }[]; reward: { xp: number } | null } | null>(null);
  const i = answers.length, cur = quiz.questions[Math.min(i, quiz.questions.length - 1)];
  async function pick(option: number) {
    const next = [...answers, option];
    setAnswers(next);
    if (next.length < quiz.questions.length) return;
    setBusy(true); setError('');
    try { const r = await api<any>(`/quiz/${quiz.key}`, { body: { answers: next } }); setResult(r); after(r); if (r.reward) toast({ kind: 'reward', emoji: '🧠', text: 'Quiz passed', sub: `+${r.reward.xp} XP` }); }
    catch (e) { setError(errMsg(e)); setAnswers(answers); } finally { setBusy(false); }
  }
  return (
    <Sheet title={quiz.title} onClose={onClose}>
      {result ? (
        <div className="col" style={{ gap: 14 }}>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 48 }} aria-hidden>{result.passed ? '🎉' : '💪'}</div><h2>{result.score} of {result.total} correct</h2>
            <p className="t2">{result.passed ? (result.reward ? `You earned ${result.reward.xp} XP.` : 'Passed again. XP is only awarded the first time.') : 'So close. Read the notes and try again.'}</p></div>
          {quiz.questions.map((q, n) => (
            <div key={n} className="card tight"><div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>{result.results[n].correct ? <Check size={18} color="var(--green)" style={{ flex: 'none', marginTop: 2 }} /> : <X size={18} color="var(--danger)" style={{ flex: 'none', marginTop: 2 }} />}
              <div><div style={{ fontWeight: 650 }}>{q.q}</div><div className="small t2" style={{ marginTop: 4 }}>Answer: {q.options[result.results[n].answer]}</div><div className="small muted">{result.results[n].why}</div></div></div></div>
          ))}
          {!result.passed && <Button block variant="purple" onClick={() => { setResult(null); setAnswers([]); }}>Try again</Button>}
          <Button block variant={result.passed ? 'primary' : 'ghost'} onClick={onClose}>Done</Button>
        </div>
      ) : (
        <div className="col" style={{ gap: 14 }}>
          <div className="row between small muted"><span>Question {Math.min(i + 1, quiz.questions.length)} of {quiz.questions.length}</span><span>+{quiz.xp} XP</span></div>
          <Bar value={(i / quiz.questions.length) * 100} label="Quiz progress" />
          <h2 style={{ margin: '6px 0' }}>{cur.q}</h2>
          <div className="col" style={{ gap: 10 }} key={i}>
            {cur.options.map((o, n) => <button key={o} className="card tight press" disabled={busy} onClick={() => pick(n)} data-autofocus={n === 0 ? true : undefined}><span className="row"><span className="badge-pill">{'ABCD'[n]}</span><span style={{ fontWeight: 600 }}>{o}</span></span></button>)}
          </div>
          {busy && <p className="muted small" role="status">Checking your answers…</p>}
          {error && <div className="error-text" role="alert">{error}</div>}
        </div>
      )}
    </Sheet>
  );
}

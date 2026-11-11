import { Link } from 'react-router-dom';
import { ArrowRight, Flame, ShieldCheck, Zap } from 'lucide-react';
import { Brand } from '../shell';
import { DemoButtons } from './Auth';
import { DISCLAIMER } from '../../shared/constants';

const FEATURES = [
  { em: '🎮', title: 'Money that plays like a game', body: 'Earn XP for real habits. Keep streaks, clear weekly missions, climb your league and unlock rewards.' },
  { em: '🔐', title: 'Vaults for every goal', body: 'Gaming PC, new phone, a trip with friends. Set the target, watch the ring fill, hit the date.' },
  { em: '💳', title: 'A card you control', body: 'Pick a design, freeze in a tap, set your own limits and get a ping on every payment.' },
  { em: '🧠', title: 'A coach, not a lecture', body: 'See where money leaks, what to cut, and how much to save. Plain language, built from your own spending.' },
  { em: '👨‍👩‍👧', title: 'Parents in the loop', body: 'Allowance on autopilot, approvals for big spends, and controls that grow with trust.' },
  { em: '🛡️', title: 'Security you can see', body: 'PIN on every payment, hidden card details, device sign-out and instant alerts.' },
];

export function Landing() {
  return (
    <div className="landing page">
      <nav aria-label="Site">
        <Brand />
        <div className="row" style={{ gap: 8 }}>
          <Link to="/login" className="btn ghost sm">Sign in</Link>
          <Link to="/register" className="btn primary sm">Get started</Link>
        </div>
      </nav>

      <section className="land-hero">
        <div className="col" style={{ gap: 22 }}>
          <span className="demo-flag" style={{ alignSelf: 'flex-start' }}>Prototype · simulated money</span>
          <h1>Money moves.<br /><span className="grad-text">You level up.</span></h1>
          <p className="lead">LevelUp turns saving, spending and learning about money into a game you actually want to play. Built for India's teens and young adults.</p>
          <div className="row wrap">
            <Link to="/register" className="btn primary">Create your account <ArrowRight size={18} /></Link>
            <Link to="/login" className="btn ghost">I already have one</Link>
          </div>
          <div className="card tight col" style={{ maxWidth: 460 }}>
            <div className="up">Just looking? Jump into a demo account</div>
            <DemoButtons />
          </div>
        </div>

        <div className="phone" aria-hidden>
          <div className="screen">
            <div className="row between"><span className="small muted">Good evening</span><span className="badge-pill green"><Flame size={12} /> 6 day streak</span></div>
            <div className="hero" style={{ padding: 16 }}>
              <div className="sub">Available balance</div>
              <div className="balance" style={{ fontSize: 34 }}>₹12,264</div>
              <div className="row" style={{ marginTop: 10, gap: 8 }}><span className="badge-pill purple"><Zap size={12} /> Level 6 · Pro</span></div>
            </div>
            <div className="card tight">
              <div className="row between small"><b>Save ₹500 this week</b><span className="green">+120 XP</span></div>
              <div className="bar" style={{ marginTop: 10 }}><i style={{ width: '78%' }} /></div>
            </div>
            <div className="card tight">
              <div className="row between small"><span>🖥️ Gaming PC</span><b className="num">44%</b></div>
              <div className="bar green" style={{ marginTop: 10 }}><i style={{ width: '44%' }} /></div>
            </div>
            <div className="card tight row small"><ShieldCheck size={18} color="var(--green)" /><span>Card frozen in one tap</span></div>
          </div>
        </div>
      </section>

      <section aria-labelledby="feat">
        <h2 id="feat" style={{ fontSize: 28, marginBottom: 18 }}>Everything your money needs. Nothing boring.</h2>
        <div className="features">
          {FEATURES.map((f) => (
            <div key={f.title} className="card feature"><div className="em" aria-hidden>{f.em}</div><h3>{f.title}</h3><p className="muted" style={{ marginTop: 6 }}>{f.body}</p></div>
          ))}
        </div>
      </section>

      <footer style={{ marginTop: 56, paddingTop: 22, borderTop: '1px solid var(--line)' }} className="col">
        <Brand />
        <p className="small muted" style={{ maxWidth: 720 }}>
          {DISCLAIMER} LevelUp does not issue cards, hold deposits, process UPI payments or perform KYC. In a live product these services would be provided by licensed banking, prepaid payment instrument and payment partners.
        </p>
      </footer>
    </div>
  );
}

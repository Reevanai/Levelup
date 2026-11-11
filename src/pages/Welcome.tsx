import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errMsg, type Me } from '../api';
import { useAuth, useMe, useToast } from '../ctx';
import { Button, PinInput } from '../ui';
import { inr } from '../lib';
import { Brand } from '../shell';

const AVATARS = ['🦊', '🐯', '🐼', '🦄', '🐺', '🦋', '🐙', '🦅', '🐸', '🦁', '🐨', '👾'];

/** First-run setup for a new teen account: avatar, budget, PIN. */
export function Welcome() {
  const me = useMe();
  const { setUser } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [avatar, setAvatar] = useState(me.avatar);
  const [budget, setBudget] = useState(5000);
  const [target, setTarget] = useState(1000);
  const [pin, setPin] = useState(''); const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');

  async function finish() {
    setError('');
    if (pin !== pin2) { setError("PINs don't match."); setPin2(''); return; }
    setBusy(true);
    try {
      if (!me.hasPin) await api('/me/pin', { body: { pin } });
      const r = await api<{ user: Me }>('/me', { method: 'PATCH', body: { avatar, monthlyBudget: budget * 100, savingsTarget: target * 100, onboarded: true } });
      setUser(r.user);
      toast({ kind: 'reward', emoji: '⚡', text: 'You earned 50 XP', sub: 'Welcome bonus' });
      nav('/app', { replace: true });
    } catch (e) { setError(errMsg(e)); setPin(''); setPin2(''); } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <div className="auth-card col" style={{ gap: 20 }}>
        <div className="row between"><Brand to="/welcome" /><span className="small muted">Step {step + 1} of 3</span></div>
        <div className="bar" aria-hidden><i style={{ width: `${((step + 1) / 3) * 100}%` }} /></div>

        {step === 0 && (
          <div className="card col page" style={{ gap: 18 }} key="a">
            <div><h1>Hey {me.name.split(' ')[0]} 👋</h1><p className="muted" style={{ marginTop: 6 }}>Pick your player avatar.</p></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }} role="group" aria-label="Avatar">
              {AVATARS.map((a) => <button key={a} type="button" className="avatar" style={{ width: '100%', height: 48, borderColor: avatar === a ? 'var(--green)' : undefined, background: avatar === a ? 'rgba(57,255,156,.12)' : undefined }} aria-pressed={avatar === a} aria-label={`Avatar ${a}`} onClick={() => setAvatar(a)}>{a}</button>)}
            </div>
            <Button block onClick={() => setStep(1)}>Continue</Button>
          </div>
        )}

        {step === 1 && (
          <div className="card col page" style={{ gap: 18 }} key="b">
            <div><h1>Set your game plan</h1><p className="muted" style={{ marginTop: 6 }}>Missions are built around these. Change them any time.</p></div>
            <div className="field">
              <div className="row between"><label htmlFor="bud">Monthly spending budget</label><b className="num">{inr(budget * 100)}</b></div>
              <input id="bud" type="range" min={1000} max={20000} step={500} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
            </div>
            <div className="field">
              <div className="row between"><label htmlFor="tar">Monthly savings target</label><b className="num green">{inr(target * 100)}</b></div>
              <input id="tar" type="range" min={200} max={10000} step={100} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
            </div>
            <div className="row"><Button variant="ghost" onClick={() => setStep(0)}>Back</Button><Button className="grow" onClick={() => setStep(2)}>Continue</Button></div>
          </div>
        )}

        {step === 2 && (
          <div className="card col page" style={{ gap: 18, textAlign: 'center' }} key="c">
            <div><h1>Lock it down 🔒</h1><p className="muted" style={{ marginTop: 6 }}>Create a 4-digit PIN. You'll use it to approve payments and reveal card details.</p></div>
            {me.hasPin ? <p className="t2">Your PIN is already set.</p> : <>
              <div className="col" style={{ gap: 8 }}><span className="label">{pin.length < 4 ? 'New PIN' : 'Confirm PIN'}</span>
                {pin.length < 4 ? <PinInput key="p1" value={pin} onChange={setPin} /> : <PinInput key="p2" value={pin2} onChange={setPin2} error={!!error} />}
              </div>
              {pin.length === 4 && <button className="link" onClick={() => { setPin(''); setPin2(''); setError(''); }}>Start over</button>}
            </>}
            <div className="error-text" role="alert" style={{ minHeight: 20 }}>{error}</div>
            <div className="row"><Button variant="ghost" onClick={() => setStep(1)}>Back</Button><Button className="grow" loading={busy} disabled={!me.hasPin && (pin.length < 4 || pin2.length < 4)} onClick={finish}>Enter LevelUp</Button></div>
          </div>
        )}
      </div>
    </div>
  );
}

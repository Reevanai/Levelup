import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { Bell, CreditCard, Home, LogOut, Settings as Cog, Sparkles, Trophy, User, Wallet, PiggyBank, Zap, Users } from 'lucide-react';
import { useAuth, useMe } from './ctx';
import { DISCLAIMER } from '../shared/constants';

const TABS = [
  { to: '/app', label: 'Home', icon: Home, end: true },
  { to: '/app/wallet', label: 'Wallet', icon: Wallet },
  { to: '/app/cards', label: 'Cards', icon: CreditCard },
  { to: '/app/rewards', label: 'Rewards', icon: Trophy },
  { to: '/app/profile', label: 'Profile', icon: User },
];

export const Brand = ({ to = '/' }: { to?: string }) => (
  <Link to={to} className="brand" aria-label="LevelUp home"><span className="mark"><Zap size={19} strokeWidth={2.8} fill="currentColor" /></span>LevelUp</Link>
);

export function Bell2({ base }: { base: string }) {
  const me = useMe();
  return (
    <Link to={`${base}/notifications`} className="icon-btn" aria-label={me.unread ? `Notifications, ${me.unread} unread` : 'Notifications'}>
      <Bell size={20} />{me.unread > 0 && <span className="dot" />}
    </Link>
  );
}

export function AppShell() {
  const me = useMe();
  return (
    <div className="shell">
      <aside className="sidenav" aria-label="Primary">
        <div style={{ padding: '0 8px 22px' }}><Brand to="/app" /></div>
        {TABS.map((t) => <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}><t.icon size={20} />{t.label}</NavLink>)}
        <div className="up" style={{ padding: '18px 14px 6px' }}>More</div>
        <NavLink to="/app/vaults" className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}><PiggyBank size={20} />Vaults</NavLink>
        <NavLink to="/app/assistant" className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}><Sparkles size={20} />Money coach</NavLink>
        <NavLink to="/app/settings" className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}><Cog size={20} />Settings</NavLink>
        <div style={{ marginTop: 'auto' }} className="col">
          <span className="demo-flag" style={{ alignSelf: 'flex-start' }}>Simulation mode</span>
          <p className="tiny muted">{DISCLAIMER}</p>
          <Link to="/app/profile" className="row" style={{ gap: 10 }}>
            <span className="avatar sm" aria-hidden>{me.avatar}</span>
            <span className="grow"><span className="truncate" style={{ display: 'block', fontWeight: 650 }}>{me.name}</span><span className="tiny muted">Level {me.level.level} · {me.level.title}</span></span>
          </Link>
        </div>
      </aside>
      <main className="main" id="main"><Outlet /></main>
      <nav className="tabbar" aria-label="Primary">
        {TABS.map((t) => <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}><t.icon size={21} />{t.label}</NavLink>)}
      </nav>
    </div>
  );
}

export function ParentShell() {
  const { logout } = useAuth();
  const nav = useNavigate();
  return (
    <div>
      <main className="main" style={{ maxWidth: 1080, paddingBottom: 60 }}>
        <div className="topbar no-print" style={{ paddingBottom: 22 }}>
          <div className="row"><Brand to="/parent" /><span className="badge-pill purple"><Users size={13} /> Parent</span></div>
          <div className="row" style={{ gap: 8 }}>
            <Bell2 base="/parent" />
            <Link to="/parent/settings" className="icon-btn" aria-label="Settings"><Cog size={20} /></Link>
            <button className="icon-btn" aria-label="Sign out" onClick={async () => { await logout(); nav('/'); }}><LogOut size={19} /></button>
          </div>
        </div>
        <Outlet />
        <p className="tiny muted" style={{ textAlign: 'center', marginTop: 32 }}>{DISCLAIMER}</p>
      </main>
    </div>
  );
}

import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './ctx';
import { ErrorState, Empty, Button } from './ui';
import { AppShell, ParentShell } from './shell';
import { Landing } from './pages/Landing';
import { Login, Register } from './pages/Auth';
import { Welcome } from './pages/Welcome';
import { Home } from './pages/Home';
import { Wallet } from './pages/Wallet';
import { TxnDetail } from './pages/Txn';
import { Cards } from './pages/Cards';
import { Rewards } from './pages/Rewards';
import { Vaults, VaultDetail } from './pages/Vaults';
import { Assistant } from './pages/Assistant';
import { Profile, Settings, Notifications, Kyc } from './pages/Profile';
import { Parent } from './pages/Parent';
import { Link } from 'react-router-dom';

const homeFor = (role: string) => (role === 'parent' ? '/parent' : '/app');

function Splash() {
  return <div className="auth" aria-busy="true" aria-label="Loading LevelUp"><div className="brand"><span className="mark"><span className="spinner" /></span>LevelUp</div></div>;
}

/** Role-based route guard. The API enforces the same rules; this only keeps the UI tidy. */
function Guard({ role, children }: { role: 'teen' | 'parent'; children: ReactNode }) {
  const { user, loading, error, refresh } = useAuth();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (error && !user) return <div className="auth"><div className="auth-card"><ErrorState error={error} retry={refresh} /></div></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  if (role === 'teen' && !user.onboarded && loc.pathname !== '/welcome') return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

function Public({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function NotFound() {
  return <div className="auth"><div className="card auth-card"><Empty emoji="🧭" title="This page doesn't exist" body="The link may be old, or you may have typed it wrong." action={<Link to="/" className="btn primary">Take me home</Link>} /></div></div>;
}

export function App() {
  return (
    <>
      <ScrollTop />
      <Routes>
        <Route path="/" element={<Public><Landing /></Public>} />
        <Route path="/login" element={<Public><Login /></Public>} />
        <Route path="/register" element={<Public><Register /></Public>} />
        <Route path="/welcome" element={<Guard role="teen"><Welcome /></Guard>} />
        <Route path="/app" element={<Guard role="teen"><AppShell /></Guard>}>
          <Route index element={<Home />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="txn/:id" element={<TxnDetail />} />
          <Route path="cards" element={<Cards />} />
          <Route path="rewards" element={<Rewards />} />
          <Route path="profile" element={<Profile />} />
          <Route path="vaults" element={<Vaults />} />
          <Route path="vaults/:id" element={<VaultDetail />} />
          <Route path="assistant" element={<Assistant />} />
          <Route path="settings" element={<Settings />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="kyc" element={<Kyc />} />
        </Route>
        <Route path="/parent" element={<Guard role="parent"><ParentShell /></Guard>}>
          <Route index element={<Parent />} />
          <Route path="settings" element={<Settings />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { Skeleton } from './components/ui/States';
import { setUnauthorizedHandler } from './lib/api';
import { useAuthMe } from './lib/queries';
import { LoginPage } from './pages/Login';

const HomePage = lazy(() => import('./pages/Home'));
const EnergyPage = lazy(() => import('./pages/Energy'));
const RepairPage = lazy(() => import('./pages/Repair'));
const LegacyPage = lazy(() => import('./pages/Legacy'));
const BuildingsPage = lazy(() => import('./pages/Buildings'));

export function App() {
  const navigate = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!location.pathname.startsWith('/login')) navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
    });
  }, [navigate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <AuthGate key={loc.pathname === '/login' ? 'l' : 'a'}>
            <AppShell />
          </AuthGate>
        }
      >
        <Route index element={<Lazy el={<HomePage />} />} />
        <Route path="buildings" element={<Lazy el={<BuildingsPage />} />} />
        <Route path="energy" element={<Lazy el={<EnergyPage />} />} />
        <Route path="repair" element={<Lazy el={<RepairPage />} />} />
        <Route path="legacy" element={<Lazy el={<LegacyPage />} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function Lazy({ el }: { el: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
        </div>
      }
    >
      {el}
    </Suspense>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const me = useAuthMe();
  const loc = useLocation();
  if (me.isLoading) return <div className="grid h-dvh place-items-center text-ink-3">加载中…</div>;
  if (me.data && me.data.authEnabled && !me.data.authenticated) {
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  }
  return <>{children}</>;
}

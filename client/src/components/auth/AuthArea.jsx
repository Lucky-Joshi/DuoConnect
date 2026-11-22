import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAppearance } from '../../hooks/useAppearance';
import { api } from '../../lib/api';
import { hasAuthHint } from '../../lib/authHint';
import { syncPushSubscription } from '../../lib/push';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { Splash } from '../layout/Splash';
import LandingPage from '../../pages/LandingPage';

const AuthPage = lazy(() => import('../../pages/AuthPage'));
const AppLayout = lazy(() => import('../layout/AppLayout'));
const ChatsPage = lazy(() => import('../../pages/ChatsPage'));
const FriendsPage = lazy(() => import('../../pages/FriendsPage'));
const ProfilePage = lazy(() => import('../../pages/ProfilePage'));
const CallsPage = lazy(() => import('../../pages/CallsPage'));
const NotificationsPage = lazy(() => import('../../pages/NotificationsPage'));
const SettingsPage = lazy(() => import('../../pages/SettingsPage'));
const NotFoundPage = lazy(() => import('../../pages/NotFoundPage'));

function RequireAuth({ children }) {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status === 'loading') return <Splash />;
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function HomeRoute() {
  const status = useAuthStore((state) => state.status);
  if (status === 'loading') return <Splash />;
  if (status === 'authenticated') return <Navigate to="/app" replace />;
  return <LandingPage />;
}

export default function AuthArea() {
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const userId = useAuthStore((state) => state.user?.id);
  const { pathname } = useLocation();

  useAppearance();

  useEffect(() => {
    if (status === 'loading') bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (status !== 'authenticated') return undefined;
    syncPushSubscription();
    let cancelled = false;
    api
      .get('/calls/active')
      .then((response) => {
        const call = response.data?.data;
        if (!cancelled && call?.status === 'ringing' && call.callee?.id === userId) {
          useCallStore.getState().handleIncoming(call);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, userId]);

  // Only the public root keeps its prerendered landing during bootstrap. Every
  // other route waits on a splash so signed-in users never see the login form.
  if (status === 'loading' && pathname === '/' && !hasAuthHint()) return <LandingPage />;
  if (status === 'loading') return <Splash />;

  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<ChatsPage />} />
          <Route path="c/:chatId" element={<ChatsPage />} />
          <Route path="friends" element={<FriendsPage />} />
          <Route path="u/:username" element={<ProfilePage />} />
          <Route path="calls" element={<CallsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

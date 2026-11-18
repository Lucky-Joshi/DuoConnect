import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAppearance } from './hooks/useAppearance';
import { useAuthStore } from './stores/authStore';
import { Splash } from './components/layout/Splash';
import { Toaster } from './components/ui/Toaster';
import AppLayout from './components/layout/AppLayout';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import ChatsPage from './pages/ChatsPage';
import FriendsPage from './pages/FriendsPage';
import ProfilePage from './pages/ProfilePage';
import CallsPage from './pages/CallsPage';
import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';

function RequireAuth({ children }) {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status === 'loading') return <Splash />;
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export default function App() {
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useAppearance();

  useEffect(() => {
    if (status === 'loading') bootstrap();
  }, [status, bootstrap]);

  if (status === 'loading') return <Splash />;

  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
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
      <Toaster />
    </>
  );
}

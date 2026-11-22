import { lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { Splash } from './components/layout/Splash';
import { Toaster } from './components/ui/Toaster';
import LandingPage from './pages/LandingPage';
import { hasAuthHint } from './lib/authHint';
import { useAuthStore } from './stores/authStore';

const AuthArea = lazy(() => import('./components/auth/AuthArea'));

export default function App() {
  const { pathname } = useLocation();
  const status = useAuthStore((state) => state.status);
  // Keep the prerendered landing page for anonymous public visits. Once the
  // refresh cookie restores a session, hand over to the authenticated shell.
  const publicLanding = pathname === '/' && !hasAuthHint() && status !== 'authenticated';

  return (
    <>
      <Suspense fallback={<Splash />}>{publicLanding ? <LandingPage /> : <AuthArea />}</Suspense>
      <Toaster />
    </>
  );
}

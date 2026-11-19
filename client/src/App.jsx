import { lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { Splash } from './components/layout/Splash';
import { Toaster } from './components/ui/Toaster';
import LandingPage from './pages/LandingPage';
import { hasAuthHint } from './lib/authHint';

const AuthArea = lazy(() => import('./components/auth/AuthArea'));

export default function App() {
  const { pathname } = useLocation();
  const publicLanding = pathname === '/' && !hasAuthHint();

  return (
    <>
      <Suspense fallback={<Splash />}>{publicLanding ? <LandingPage /> : <AuthArea />}</Suspense>
      <Toaster />
    </>
  );
}

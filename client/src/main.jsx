import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { configureApi } from './lib/api';
import { hasAuthHint } from './lib/authHint';
import { registerServiceWorker, syncPushSubscription } from './lib/push';
import { useAuthStore } from './stores/authStore';
import './styles/base.css';

configureApi({
  onSession: (session) => useAuthStore.getState().setSession(session),
  onExpired: () => useAuthStore.getState().expire(),
});

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerServiceWorker();
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'duoconnect:push-subscription-changed') syncPushSubscription();
  });
}

// The refresh cookie is authoritative, so restore the session on every launch.
// The localStorage hint only prevents a public landing flash; it must never be
// required to discover a still-valid session.
useAuthStore.getState().bootstrap();

const root = document.getElementById('root');
const renderApp = () => (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

if (root.hasChildNodes() && window.location.pathname === '/' && !hasAuthHint()) {
  hydrateRoot(root, renderApp());
} else {
  root.replaceChildren();
  createRoot(root).render(renderApp());
}

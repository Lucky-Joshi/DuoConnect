import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { configureApi } from './lib/api';
import { useAuthStore } from './stores/authStore';
import './styles/base.css';

configureApi({
  onSession: (session) => useAuthStore.getState().setSession(session),
  onExpired: () => useAuthStore.getState().expire(),
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

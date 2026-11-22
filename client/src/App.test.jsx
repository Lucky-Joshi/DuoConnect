import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./components/auth/AuthArea', () => ({
  default: () => <div data-testid="auth-area" />,
}));

vi.mock('./components/ui/Toaster', () => ({
  Toaster: () => null,
}));

vi.mock('./pages/LandingPage', () => ({
  default: () => <div data-testid="landing" />,
}));

vi.mock('./lib/authHint', () => ({
  hasAuthHint: vi.fn(() => false),
  setAuthHint: vi.fn(),
}));

import App from './App';
import { useAuthStore } from './stores/authStore';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App auth routing', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'loading', user: null, settings: null });
  });

  it('keeps the prerendered landing page while a public visit restores its session', () => {
    renderAt('/');
    expect(screen.getByTestId('landing')).toBeInTheDocument();
  });

  it('hands over to the auth shell as soon as a session is restored', async () => {
    renderAt('/');
    act(() => {
      useAuthStore.setState({
        status: 'authenticated',
        user: { id: 'user-1' },
        settings: {},
      });
    });

    expect(await screen.findByTestId('auth-area')).toBeInTheDocument();
    expect(screen.queryByTestId('landing')).not.toBeInTheDocument();
  });

  it('waits in the auth shell instead of showing the landing page on login', async () => {
    renderAt('/login');
    expect(await screen.findByTestId('auth-area')).toBeInTheDocument();
    expect(screen.queryByTestId('landing')).not.toBeInTheDocument();
  });
});

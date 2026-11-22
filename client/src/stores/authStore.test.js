import { describe, expect, it, vi } from 'vitest';

const { refresh, setAuthHint } = vi.hoisted(() => ({
  refresh: vi.fn(),
  setAuthHint: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { post: refresh },
  setAccessToken: vi.fn(),
  unwrap: (response) => response?.data?.data,
}));

vi.mock('../lib/authHint', () => ({
  hasAuthHint: vi.fn(() => false),
  setAuthHint,
}));

vi.mock('../lib/socket', () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  getSocket: vi.fn(() => null),
}));

describe('authStore bootstrap', () => {
  it('restores a session from the refresh cookie without an auth hint', async () => {
    const session = {
      accessToken: 'access-token',
      user: { id: 'user-1' },
      settings: { theme: 'dark' },
    };
    refresh.mockResolvedValue({ data: { data: session } });

    const { useAuthStore } = await import('./authStore');
    await useAuthStore.getState().bootstrap();

    expect(refresh).toHaveBeenCalledWith('/auth/refresh', null, {
      skipAuthRefresh: true,
      timeout: 20_000,
    });
    expect(setAuthHint).toHaveBeenCalledWith(true);
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().user).toEqual(session.user);
  });
});

import { create } from 'zustand';
import { api, setAccessToken, unwrap } from '../lib/api';
import { setAuthHint } from '../lib/authHint';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';

const refreshConfig = { skipAuthRefresh: true, timeout: 20_000 };

let bootstrapPromise = null;

function clearSession(set) {
  setAccessToken(null);
  setAuthHint(false);
  disconnectSocket();
  set({ status: 'anonymous', user: null, settings: null });
}

function applySession(set, session) {
  setAccessToken(session.accessToken);
  setAuthHint(true);
  if (getSocket()) connectSocket(session.accessToken);
  set({
    status: 'authenticated',
    user: session.user,
    settings: session.settings,
  });
}

export const useAuthStore = create((set, get) => ({
  status: 'loading',
  user: null,
  settings: null,

  bootstrap: () => {
    if (bootstrapPromise) return bootstrapPromise;
    bootstrapPromise = (async () => {
      try {
        const session = unwrap(await api.post('/auth/refresh', null, refreshConfig));
        if (session) {
          applySession(set, session);
        } else {
          clearSession(set);
        }
      } catch {
        clearSession(set);
      }
    })();
    return bootstrapPromise;
  },

  setSession: (session) => {
    applySession(set, session);
  },

  expire: () => {
    if (get().status === 'anonymous') return;
    clearSession(set);
  },

  login: async (input) => {
    const session = unwrap(await api.post('/auth/login', input));
    applySession(set, session);
    return session;
  },

  register: async (input) => {
    const session = unwrap(await api.post('/auth/register', input));
    applySession(set, session);
    return session;
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // The local session should end even if the server is unreachable.
    }
    clearSession(set);
  },

  refreshMe: async () => {
    const data = unwrap(await api.get('/auth/me'));
    set({ user: data.user, settings: data.settings });
    return data;
  },

  updateProfile: async (input) => {
    const data = unwrap(await api.patch('/users/me', input));
    set({ user: data.user, settings: data.settings });
    return data;
  },

  updateSettings: async (input) => {
    const settings = unwrap(await api.patch('/users/me/settings', input));
    set({ settings });
    return settings;
  },

  setUser: (user) => set({ user: { ...get().user, ...user } }),
  setSettings: (settings) => set({ settings: { ...get().settings, ...settings } }),
}));

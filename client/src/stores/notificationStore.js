import { create } from 'zustand';
import { api, unwrap } from '../lib/api';

export const useNotificationStore = create((set, get) => ({
  items: [],
  unread: 0,
  loading: false,
  loaded: false,
  error: null,

  fetch: async () => {
    set({ loading: !get().loaded, error: null });
    try {
      const data = unwrap(await api.get('/notifications', { params: { limit: 60 } }));
      set({
        items: data?.items ?? [],
        unread: data?.unread ?? 0,
        loaded: true,
        loading: false,
      });
    } catch (error) {
      set({ loading: false, error });
    }
  },

  fetchSummary: async () => {
    try {
      const data = unwrap(await api.get('/notifications/summary'));
      set({ unread: data?.unread ?? 0 });
    } catch {
      // A background summary refresh is not worth surfacing.
    }
  },

  receive: (notification) =>
    set((state) => ({
      items: [notification, ...state.items.filter((item) => item.id !== notification.id)],
      unread: state.items.some((item) => item.id === notification.id)
        ? state.unread
        : state.unread + 1,
    })),

  applyRead: ({ id, unread }) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item,
      ),
      unread: typeof unread === 'number' ? unread : Math.max(0, state.unread - 1),
    })),

  applyReadAll: () =>
    set((state) => ({
      items: state.items.map((item) => ({
        ...item,
        readAt: item.readAt ?? new Date().toISOString(),
      })),
      unread: 0,
    })),

  markRead: async (id) => {
    const data = unwrap(await api.post(`/notifications/${id}/read`));
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item,
      ),
      unread: typeof data?.unread === 'number' ? data.unread : state.unread,
    }));
  },

  markAllRead: async () => {
    await api.post('/notifications/read-all');
    set((state) => ({
      items: state.items.map((item) => ({
        ...item,
        readAt: item.readAt ?? new Date().toISOString(),
      })),
      unread: 0,
    }));
  },

  remove: async (id) => {
    const wasUnread = get().items.some((item) => item.id === id && !item.readAt);
    await api.delete(`/notifications/${id}`);
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
      unread: Math.max(0, state.unread - (wasUnread ? 1 : 0)),
    }));
  },

  clearRead: async () => {
    await api.delete('/notifications/read');
    set((state) => ({ items: state.items.filter((item) => !item.readAt) }));
  },

  reset: () => set({ items: [], unread: 0, loading: false, loaded: false, error: null }),
}));

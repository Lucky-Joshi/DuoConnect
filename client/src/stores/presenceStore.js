import { create } from 'zustand';

export const usePresenceStore = create((set, get) => ({
  byId: {},

  replace: (friends = []) => {
    const byId = {};
    for (const entry of friends) {
      byId[entry.userId] = {
        status: entry.status ?? 'offline',
        lastSeenAt: entry.lastSeenAt ?? null,
      };
    }
    set({ byId });
  },

  applyUpdate: ({ userId, status, lastSeenAt }) => {
    if (!userId) return;
    set((state) => ({
      byId: {
        ...state.byId,
        [userId]: {
          status: status ?? 'offline',
          lastSeenAt: lastSeenAt ?? (status === 'offline' ? new Date().toISOString() : null),
        },
      },
    }));
  },

  getEntry: (userId) => get().byId[userId] ?? null,

  reset: () => set({ byId: {} }),
}));

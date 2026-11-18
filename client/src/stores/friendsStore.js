import { create } from 'zustand';
import { api, unwrap } from '../lib/api';

const byUser = (a, b) => a.user?.id === b.user?.id;

export const useFriendsStore = create((set, get) => ({
  friends: [],
  incoming: [],
  outgoing: [],
  blocked: [],
  searchResults: [],
  loading: false,
  loaded: false,
  searching: false,
  error: null,

  fetchAll: async () => {
    set({ loading: !get().loaded, error: null });
    try {
      const [friends, requests, blocked] = await Promise.all([
        api.get('/friends').then(unwrap),
        api.get('/friends/requests').then(unwrap),
        api.get('/friends/blocked').then(unwrap),
      ]);
      set({
        friends: friends ?? [],
        incoming: requests?.incoming ?? [],
        outgoing: requests?.outgoing ?? [],
        blocked: blocked ?? [],
        loaded: true,
        loading: false,
      });
    } catch (error) {
      set({ loading: false, error });
    }
  },

  refreshFriends: async () => {
    const friends = unwrap(await api.get('/friends'));
    set({ friends: friends ?? [] });
  },

  refreshRequests: async () => {
    const requests = unwrap(await api.get('/friends/requests'));
    set({ incoming: requests?.incoming ?? [], outgoing: requests?.outgoing ?? [] });
  },

  refreshBlocked: async () => {
    const blocked = unwrap(await api.get('/friends/blocked'));
    set({ blocked: blocked ?? [] });
  },

  searchUsers: async (query) => {
    const q = query.trim();
    if (q.length < 2) {
      set({ searchResults: [], searching: false });
      return [];
    }
    set({ searching: true });
    try {
      const results = unwrap(await api.get('/users/search', { params: { q } }));
      set({ searchResults: results ?? [], searching: false });
      return results ?? [];
    } catch (error) {
      set({ searching: false });
      throw error;
    }
  },

  clearSearch: () => set({ searchResults: [], searching: false }),

  sendRequest: async (userId, message) => {
    const data = unwrap(await api.post('/friends/requests', { userId, message: message || null }));
    if (data.accepted) {
      await get().fetchAll();
      return data;
    }
    set((state) => ({
      outgoing: [data.request, ...state.outgoing.filter((item) => item.id !== data.request.id)],
    }));
    return data;
  },

  accept: async (requestId) => {
    const data = unwrap(await api.post(`/friends/requests/${requestId}/accept`));
    set((state) => ({ incoming: state.incoming.filter((item) => item.id !== requestId) }));
    await get().fetchAll();
    return data;
  },

  decline: async (requestId) => {
    await api.post(`/friends/requests/${requestId}/decline`);
    set((state) => ({ incoming: state.incoming.filter((item) => item.id !== requestId) }));
  },

  cancel: async (requestId) => {
    await api.delete(`/friends/requests/${requestId}`);
    set((state) => ({ outgoing: state.outgoing.filter((item) => item.id !== requestId) }));
  },

  remove: async (friendId) => {
    await api.delete(`/friends/${friendId}`);
    set((state) => ({
      friends: state.friends.filter((entry) => entry.user.id !== friendId),
      searchResults: state.searchResults.map((entry) =>
        entry.user.id === friendId
          ? { ...entry, relation: { ...entry.relation, isFriend: false } }
          : entry,
      ),
    }));
  },

  block: async (userId) => {
    await api.post('/friends/block', { userId });
    set((state) => ({
      friends: state.friends.filter((entry) => entry.user.id !== userId),
      incoming: state.incoming.filter((entry) => entry.user.id !== userId),
      outgoing: state.outgoing.filter((entry) => entry.user.id !== userId),
      searchResults: state.searchResults.map((entry) =>
        entry.user.id === userId
          ? {
              ...entry,
              relation: { ...entry.relation, isFriend: false, blockedByMe: true, request: null },
            }
          : entry,
      ),
    }));
    await get().refreshBlocked();
  },

  unblock: async (userId) => {
    await api.delete(`/friends/block/${userId}`);
    set((state) => ({ blocked: state.blocked.filter((entry) => entry.user.id !== userId) }));
  },

  isFriend: (userId) => get().friends.some((entry) => entry.user.id === userId),
  hasPending: (userId) =>
    get().incoming.some((entry) => entry.user.id === userId) ||
    get().outgoing.some((entry) => entry.user.id === userId),

  /* ---- realtime patches ---- */
  handleIncomingRequest: (request) =>
    set((state) => ({
      incoming: [request, ...state.incoming.filter((item) => item.id !== request.id)],
    })),

  handleOutgoingRequest: (request) =>
    set((state) => ({
      outgoing: [request, ...state.outgoing.filter((item) => item.id !== request.id)],
    })),

  handleRequestRemoved: ({ requestId }) =>
    set((state) => ({
      incoming: state.incoming.filter((item) => item.id !== requestId),
      outgoing: state.outgoing.filter((item) => item.id !== requestId),
    })),

  handleFriendRemoved: ({ userId }) =>
    set((state) => ({
      friends: state.friends.filter((entry) => entry.user.id !== userId),
    })),

  handleBlocked: ({ user }) =>
    set((state) => ({
      friends: state.friends.filter((entry) => entry.user.id !== user.id),
      incoming: state.incoming.filter((entry) => entry.user.id !== user.id),
      outgoing: state.outgoing.filter((entry) => entry.user.id !== user.id),
      blocked: [
        { user, blockedAt: new Date().toISOString() },
        ...state.blocked.filter((entry) => entry.user.id !== user.id),
      ],
    })),

  handleUnblocked: ({ userId }) =>
    set((state) => ({ blocked: state.blocked.filter((entry) => entry.user.id !== userId) })),

  reset: () =>
    set({
      friends: [],
      incoming: [],
      outgoing: [],
      blocked: [],
      searchResults: [],
      loaded: false,
      loading: false,
      searching: false,
      error: null,
    }),

  resetIfChanged: (friends) => {
    const current = get().friends;
    if (
      current.length !== friends.length ||
      !friends.every((entry) => current.some((item) => byUser(item, entry)))
    ) {
      set({ friends });
    }
  },
}));

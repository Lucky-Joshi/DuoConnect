import { create } from 'zustand';
import { api, unwrap } from '../lib/api';
import { emitWithAck } from '../lib/socket';

export const useGameStore = create((set, get) => ({
  activeByChat: {},
  historyByChat: {},
  statsByChat: {},
  openGameId: null,
  loadingActive: {},

  setOpenGame: (gameId) => set({ openGameId: gameId }),

  upsertGame: (game) => {
    if (!game?.chatId) return;
    set((state) => {
      const activeByChat = { ...state.activeByChat };
      const historyByChat = { ...state.historyByChat };
      const currentHistory = historyByChat[game.chatId] || [];
      const idx = currentHistory.findIndex((g) => g.id === game.id);
      historyByChat[game.chatId] =
        idx === -1
          ? [game, ...currentHistory].slice(0, 20)
          : currentHistory.map((g) => (g.id === game.id ? game : g));

      if (['invited', 'active'].includes(game.status)) {
        activeByChat[game.chatId] = game;
      } else if (activeByChat[game.chatId]?.id === game.id) {
        delete activeByChat[game.chatId];
      }
      return { activeByChat, historyByChat };
    });
  },

  fetchActive: async (chatId) => {
    if (!chatId) return null;
    set((state) => ({ loadingActive: { ...state.loadingActive, [chatId]: true } }));
    try {
      const game = unwrap(await api.get(`/games/chat/${chatId}/active`));
      set((state) => {
        const activeByChat = { ...state.activeByChat };
        if (game) activeByChat[chatId] = game;
        else delete activeByChat[chatId];
        return { activeByChat };
      });
      return game;
    } finally {
      set((state) => ({ loadingActive: { ...state.loadingActive, [chatId]: false } }));
    }
  },

  fetchHistory: async (chatId) => {
    const data = unwrap(await api.get(`/games/chat/${chatId}/history`));
    set((state) => ({ historyByChat: { ...state.historyByChat, [chatId]: data || [] } }));
    return data || [];
  },

  fetchStats: async (chatId) => {
    const data = unwrap(await api.get(`/games/chat/${chatId}/stats`));
    set((state) => ({ statsByChat: { ...state.statsByChat, [chatId]: data || [] } }));
    return data || [];
  },

  invite: async (input) => {
    const game = unwrap(await api.post('/games/invites', input));
    get().upsertGame(game);
    return game;
  },

  accept: async (gameId) => {
    const game = unwrap(await api.post(`/games/${gameId}/accept`));
    get().upsertGame(game);
    return game;
  },

  decline: async (gameId) => {
    const game = unwrap(await api.post(`/games/${gameId}/decline`));
    get().upsertGame(game);
    return game;
  },

  move: async (gameId, index) => {
    try {
      const game = await emitWithAck('game:move', { gameId, index });
      get().upsertGame(game);
      return game;
    } catch {
      const game = unwrap(await api.post(`/games/${gameId}/move`, { index }));
      get().upsertGame(game);
      return game;
    }
  },

  stroke: async (gameId, stroke) => {
    try {
      const game = await emitWithAck('game:stroke', { gameId, stroke });
      get().upsertGame(game);
      return game;
    } catch {
      const game = unwrap(await api.post(`/games/${gameId}/stroke`, { stroke }));
      get().upsertGame(game);
      return game;
    }
  },

  drawAction: async (gameId, action, payload = {}) => {
    const game = unwrap(await api.post(`/games/${gameId}/draw-action`, { action, payload }));
    get().upsertGame(game);
    return game;
  },

  guess: async (gameId, guess) => {
    const game = unwrap(await api.post(`/games/${gameId}/guess`, { guess }));
    get().upsertGame(game);
    return game;
  },

  advanceRound: async (gameId) => {
    const game = unwrap(await api.post(`/games/${gameId}/advance-round`));
    get().upsertGame(game);
    return game;
  },

  playAgain: async (gameId) => {
    const game = unwrap(await api.post(`/games/${gameId}/play-again`));
    get().upsertGame(game);
    return game;
  },

  refreshActive: async () => {
    const { activeChatId } = await import('./chatStore').then((m) => m.useChatStore.getState());
    if (activeChatId) return get().fetchActive(activeChatId);
    return null;
  },

  reset: () =>
    set({
      activeByChat: {},
      historyByChat: {},
      statsByChat: {},
      openGameId: null,
      loadingActive: {},
    }),
}));

import { create } from 'zustand';
import { api, unwrap } from '../lib/api';
import { emitEvent, emitWithAck, getSocket } from '../lib/socket';
import { MESSAGE_PAGE_SIZE, TYPING_IDLE_MS, TYPING_REFRESH_MS } from '../lib/constants';
import { messagePreview } from '../lib/utils';
import { useAuthStore } from './authStore';

const typingTimers = new Map();
const typingSentAt = new Map();
const typingIdleTimers = new Map();
const readPending = new Map();

function emptyThread() {
  return {
    items: [],
    hasMore: false,
    hasMoreNewer: false,
    nextCursor: null,
    loaded: false,
    loading: false,
    loadingOlder: false,
    error: null,
  };
}

function clientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sortBySeq(items) {
  return items.slice().sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
}

function latestSeq(items) {
  let max = 0;
  for (const item of items) max = Math.max(max, Number(item.seq) || 0);
  return max;
}

function summaryOf(message) {
  return {
    id: message.id,
    seq: Number(message.seq) || 0,
    type: message.type,
    preview: messagePreview(message),
    senderId: message.sender?.id ?? null,
    senderName: message.sender?.displayName ?? '',
    createdAt: message.createdAt,
    deleted: Boolean(message.deletedAt),
  };
}

function bumpChat(chats, message, { unread = false } = {}) {
  return chats.map((chat) => {
    if (chat.id !== message.chatId) return chat;
    const currentSeq = Number(chat.lastMessage?.seq) || 0;
    const nextSeq = Number(message.seq) || 0;
    const isLatest = nextSeq >= currentSeq;
    return {
      ...chat,
      lastMessage: isLatest || !chat.lastMessage ? summaryOf(message) : chat.lastMessage,
      updatedAt: isLatest || !chat.updatedAt ? message.createdAt : chat.updatedAt,
      unread: unread ? (Number(chat.unread) || 0) + 1 : chat.unread,
    };
  });
}

function mergeMessage(items, message, optimisticClientId = null) {
  const key = message.clientId ?? optimisticClientId;
  const isMatch = (item) => item.id === message.id || (key && item.clientId === key);
  let replaced = false;
  const next = [];

  for (const item of items) {
    if (isMatch(item)) {
      if (!replaced) {
        next.push({
          ...message,
          pending: false,
          failed: false,
          clientId: key ?? message.clientId ?? null,
        });
        replaced = true;
      }
      continue;
    }
    next.push(item);
  }

  if (!replaced)
    next.push({ ...message, pending: false, clientId: key ?? message.clientId ?? null });
  return sortBySeq(next);
}

function receiptFor(message, userId) {
  return message.receipts?.find((receipt) => receipt.userId === userId) ?? null;
}

function patchReceipt(message, userId, patch) {
  const receipts = message.receipts?.slice() ?? [];
  const index = receipts.findIndex((receipt) => receipt.userId === userId);
  if (index >= 0) receipts[index] = { ...receipts[index], ...patch };
  else receipts.push({ userId, deliveredAt: null, readAt: null, ...patch });
  return { ...message, receipts };
}

export const useChatStore = create((set, get) => ({
  chats: [],
  threads: {},
  pins: {},
  typing: {},
  drafts: {},
  activeChatId: null,
  loaded: false,
  loading: false,
  error: null,

  fetchChats: async () => {
    set({ loading: !get().loaded });
    try {
      const chats = unwrap(await api.get('/chats'));
      set({ chats: chats ?? [], loaded: true, loading: false, error: null });
    } catch (error) {
      set({ loading: false, error });
    }
  },

  fetchChat: async (chatId) => {
    const data = unwrap(await api.get(`/chats/${chatId}`));
    if (data?.chat) get().upsertChat(data.chat);
    return data;
  },

  upsertChat: (chat) =>
    set((state) => {
      const exists = state.chats.some((item) => item.id === chat.id);
      return {
        chats: exists
          ? state.chats.map((item) => (item.id === chat.id ? { ...item, ...chat } : item))
          : [chat, ...state.chats],
      };
    }),

  createDirect: async (userId) => {
    const chat = unwrap(await api.post('/chats/direct', { userId }));
    get().upsertChat(chat);
    return chat;
  },

  openChat: async (chatId) => {
    set({ activeChatId: chatId });
    const thread = get().threads[chatId];
    const tasks = [get().fetchChat(chatId), get().fetchPins(chatId)];
    if (!thread?.loaded && !thread?.loading) tasks.push(get().loadMessages(chatId));
    await Promise.allSettled(tasks);
  },

  closeChat: () => set({ activeChatId: null }),

  loadMessages: async (chatId, { around = null } = {}) => {
    set((state) => ({
      threads: {
        ...state.threads,
        [chatId]: { ...(state.threads[chatId] ?? emptyThread()), loading: true, error: null },
      },
    }));

    try {
      const data = unwrap(
        await api.get(`/chats/${chatId}/messages`, {
          params: { limit: MESSAGE_PAGE_SIZE, ...(around ? { around } : {}) },
        }),
      );
      set((state) => ({
        threads: {
          ...state.threads,
          [chatId]: {
            items: data?.items ?? [],
            hasMore: Boolean(data?.hasMore),
            hasMoreNewer: Boolean(data?.hasMoreNewer),
            nextCursor: data?.nextCursor ?? null,
            loaded: true,
            loading: false,
            loadingOlder: false,
            error: null,
          },
        },
      }));
      return data;
    } catch (error) {
      set((state) => ({
        threads: {
          ...state.threads,
          [chatId]: { ...(state.threads[chatId] ?? emptyThread()), loading: false, error },
        },
      }));
      throw error;
    }
  },

  loadOlder: async (chatId) => {
    const thread = get().threads[chatId];
    if (!thread?.loaded || thread.loadingOlder || !thread.hasMore) return;
    if (thread.nextCursor === null || thread.nextCursor === undefined) return;

    set((state) => ({
      threads: {
        ...state.threads,
        [chatId]: { ...state.threads[chatId], loadingOlder: true },
      },
    }));

    try {
      const data = unwrap(
        await api.get(`/chats/${chatId}/messages`, {
          params: { limit: MESSAGE_PAGE_SIZE, cursor: thread.nextCursor },
        }),
      );
      set((state) => {
        const current = state.threads[chatId] ?? emptyThread();
        const seen = new Set(current.items.map((item) => item.id));
        const older = (data?.items ?? []).filter((item) => !seen.has(item.id));
        return {
          threads: {
            ...state.threads,
            [chatId]: {
              ...current,
              items: [...older, ...current.items],
              hasMore: Boolean(data?.hasMore),
              nextCursor: data?.nextCursor ?? null,
              loadingOlder: false,
            },
          },
        };
      });
    } catch (error) {
      set((state) => ({
        threads: {
          ...state.threads,
          [chatId]: { ...state.threads[chatId], loadingOlder: false, error },
        },
      }));
    }
  },

  loadAround: async (chatId, seq) => {
    return get().loadMessages(chatId, { around: seq });
  },

  refreshActive: async () => {
    const { activeChatId } = get();
    await get().fetchChats();
    if (activeChatId && get().threads[activeChatId]?.loaded) {
      await get()
        .loadMessages(activeChatId)
        .catch(() => {});
      await get()
        .fetchPins(activeChatId)
        .catch(() => {});
    }
  },

  sendMessage: async (
    chatId,
    {
      body = '',
      type = 'text',
      replyToId = null,
      replyTo = null,
      attachmentIds = [],
      attachments = [],
    },
  ) => {
    const me = useAuthStore.getState().user;
    if (!me) throw new Error('You need to be signed in to send messages.');

    const key = clientId();
    const thread = get().threads[chatId] ?? emptyThread();
    const seq = latestSeq(thread.items) + 0.5;
    const payload = {
      chatId,
      body,
      type,
      replyToId,
      attachmentIds,
      clientId: key,
    };
    const pending = {
      id: `pending:${key}`,
      clientId: key,
      seq,
      chatId,
      sender: {
        id: me.id,
        username: me.username,
        displayName: me.displayName,
        avatarUrl: me.avatarUrl,
      },
      type,
      body: body || null,
      metadata: {},
      replyTo: replyTo
        ? {
            id: replyTo.id,
            body: replyTo.body,
            type: replyTo.type,
            sender: replyTo.sender,
            deleted: Boolean(replyTo.deletedAt),
          }
        : null,
      forwardedFromId: null,
      attachments,
      receipts: [],
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      isPinned: false,
      pending: true,
      failed: false,
      _payload: payload,
    };

    set((state) => ({
      threads: {
        ...state.threads,
        [chatId]: {
          ...(state.threads[chatId] ?? emptyThread()),
          items: [...(state.threads[chatId]?.items ?? []), pending],
          loaded: true,
        },
      },
      chats: bumpChat(state.chats, pending),
    }));

    try {
      let message;
      if (getSocket()?.connected) {
        message = await emitWithAck('message:send', payload);
      } else {
        message = unwrap(
          await api.post(`/chats/${chatId}/messages`, {
            body,
            type,
            replyToId,
            attachmentIds,
            clientId: key,
          }),
        );
      }

      get().stopTyping(chatId);
      set((state) => ({
        threads: {
          ...state.threads,
          [chatId]: {
            ...(state.threads[chatId] ?? emptyThread()),
            items: mergeMessage(state.threads[chatId]?.items ?? [], message, key),
          },
        },
        chats: bumpChat(state.chats, message),
      }));
      return message;
    } catch (error) {
      set((state) => ({
        threads: {
          ...state.threads,
          [chatId]: {
            ...(state.threads[chatId] ?? emptyThread()),
            items: (state.threads[chatId]?.items ?? []).map((item) =>
              item.id === pending.id ? { ...item, pending: false, failed: true } : item,
            ),
          },
        },
      }));
      throw error;
    }
  },

  retryMessage: async (chatId, message) => {
    const payload = message._payload;
    if (!payload) return;
    set((state) => ({
      threads: {
        ...state.threads,
        [chatId]: {
          ...(state.threads[chatId] ?? emptyThread()),
          items: (state.threads[chatId]?.items ?? []).filter((item) => item.id !== message.id),
        },
      },
    }));
    return get().sendMessage(chatId, {
      body: payload.body,
      type: payload.type,
      replyToId: payload.replyToId,
      replyTo: message.replyTo,
      attachmentIds: payload.attachmentIds,
      attachments: message.attachments,
    });
  },

  receiveMessage: (message) => {
    const state = get();
    if (!state.threads[message.chatId]) {
      // A conversation we do not have yet (e.g. accepted while offline).
      get().fetchChats();
      get()
        .fetchChat(message.chatId)
        .catch(() => {});
    }

    const thread = state.threads[message.chatId] ?? emptyThread();
    const isActive = state.activeChatId === message.chatId;
    const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
    const fromMe = message.sender?.id === useAuthStore.getState().user?.id;
    const shouldUnread = !isActive || !visible;

    set((current) => ({
      threads: {
        ...current.threads,
        [message.chatId]: {
          ...(current.threads[message.chatId] ?? thread),
          items: mergeMessage(
            current.threads[message.chatId]?.items ?? [],
            message,
            message.clientId,
          ),
        },
      },
      chats: current.chats.some((chat) => chat.id === message.chatId)
        ? bumpChat(current.chats, message, { unread: !fromMe && shouldUnread })
        : current.chats,
    }));
  },

  applyUpdated: (message) =>
    set((state) => ({
      threads: {
        ...state.threads,
        [message.chatId]: {
          ...(state.threads[message.chatId] ?? emptyThread()),
          items: (state.threads[message.chatId]?.items ?? []).map((item) =>
            item.id === message.id ? { ...item, ...message } : item,
          ),
        },
      },
      chats: bumpChat(state.chats, message),
    })),

  applyDeleted: (message) =>
    set((state) => ({
      threads: {
        ...state.threads,
        [message.chatId]: {
          ...(state.threads[message.chatId] ?? emptyThread()),
          items: (state.threads[message.chatId]?.items ?? []).map((item) =>
            item.id === message.id ? { ...item, ...message, isPinned: false } : item,
          ),
        },
      },
      pins: {
        ...state.pins,
        [message.chatId]: (state.pins[message.chatId] ?? []).filter(
          (item) => item.id !== message.id,
        ),
      },
      chats: bumpChat(state.chats, message),
    })),

  applyDelivered: ({ messageIds = [], recipientId }) =>
    set((state) => {
      const ids = new Set(messageIds);
      const threads = {};
      for (const [chatId, thread] of Object.entries(state.threads)) {
        if (!thread.items.some((item) => ids.has(item.id))) {
          threads[chatId] = thread;
          continue;
        }
        threads[chatId] = {
          ...thread,
          items: thread.items.map((item) =>
            ids.has(item.id) && item.sender?.id !== recipientId
              ? patchReceipt(item, recipientId, {
                  deliveredAt:
                    receiptFor(item, recipientId)?.deliveredAt ?? new Date().toISOString(),
                })
              : item,
          ),
        };
      }
      return { threads };
    }),

  applyRead: ({ chatId, messageIds = [], readerId }) =>
    set((state) => {
      const ids = new Set(messageIds);
      const thread = state.threads[chatId];
      if (!thread) return {};
      return {
        threads: {
          ...state.threads,
          [chatId]: {
            ...thread,
            items: thread.items.map((item) =>
              ids.has(item.id)
                ? patchReceipt(item, readerId, {
                    deliveredAt:
                      receiptFor(item, readerId)?.deliveredAt ?? new Date().toISOString(),
                    readAt: new Date().toISOString(),
                  })
                : item,
            ),
          },
        },
      };
    }),

  applyChatRead: ({ chatId, lastReadSeq }) =>
    set((state) => ({
      chats: state.chats.map((chat) => {
        if (chat.id !== chatId) return chat;
        const thread = state.threads[chatId];
        const unread = thread
          ? thread.items.filter(
              (item) =>
                parseInt(item.seq, 10) > Number(lastReadSeq) &&
                item.sender?.id !== useAuthStore.getState().user?.id,
            ).length
          : 0;
        return { ...chat, lastReadSeq: Number(lastReadSeq), unread };
      }),
    })),

  applyPinned: ({ chatId, messageId, pinned }) => {
    set((state) => ({
      threads: {
        ...state.threads,
        [chatId]: {
          ...(state.threads[chatId] ?? emptyThread()),
          items: (state.threads[chatId]?.items ?? []).map((item) =>
            item.id === messageId ? { ...item, isPinned: pinned } : item,
          ),
        },
      },
    }));
    get()
      .fetchPins(chatId)
      .catch(() => {});
  },

  fetchPins: async (chatId) => {
    const pins = unwrap(await api.get(`/chats/${chatId}/pins`));
    set((state) => ({
      pins: { ...state.pins, [chatId]: pins ?? [] },
      threads: state.threads[chatId]
        ? {
            ...state.threads,
            [chatId]: {
              ...state.threads[chatId],
              items: state.threads[chatId].items.map((item) => ({
                ...item,
                isPinned: (pins ?? []).some((pin) => pin.id === item.id),
              })),
            },
          }
        : state.threads,
    }));
  },

  markRead: async (chatId, uptoSeq) => {
    const state = get();
    const seq = Number(uptoSeq);
    if (!seq) return;
    const chat = state.chats.find((item) => item.id === chatId);
    if (!chat) return;
    if (Number(chat.lastReadSeq) >= seq) return;
    if (readPending.get(chatId) === seq) return;
    readPending.set(chatId, seq);

    set((current) => ({
      chats: current.chats.map((item) =>
        item.id === chatId ? { ...item, lastReadSeq: seq, unread: 0 } : item,
      ),
    }));

    try {
      if (getSocket()?.connected) {
        await emitWithAck('message:read', { chatId, uptoSeq: seq });
      } else {
        await api.post(`/chats/${chatId}/read`, { uptoSeq: seq });
      }
    } catch {
      // The next message or reconnect will retry the receipt.
    } finally {
      if (readPending.get(chatId) === seq) readPending.delete(chatId);
    }
  },

  setDraft: (chatId, value) => set((state) => ({ drafts: { ...state.drafts, [chatId]: value } })),

  clearDraft: (chatId) =>
    set((state) => {
      const drafts = { ...state.drafts };
      delete drafts[chatId];
      return { drafts };
    }),

  notifyTyping: (chatId) => {
    if (!getSocket()?.connected) return;
    const now = Date.now();
    if (now - (typingSentAt.get(chatId) ?? 0) > TYPING_REFRESH_MS) {
      typingSentAt.set(chatId, now);
      emitEvent('typing:start', { chatId });
    }
    clearTimeout(typingIdleTimers.get(chatId));
    typingIdleTimers.set(
      chatId,
      setTimeout(() => {
        typingSentAt.delete(chatId);
        emitEvent('typing:stop', { chatId });
      }, TYPING_IDLE_MS),
    );
  },

  stopTyping: (chatId) => {
    clearTimeout(typingIdleTimers.get(chatId));
    typingIdleTimers.delete(chatId);
    typingSentAt.delete(chatId);
    if (getSocket()?.connected) emitEvent('typing:stop', { chatId });
  },

  applyTyping: ({ chatId, userId, displayName, active, expiresAt }) => {
    const key = `${chatId}:${userId}`;
    clearTimeout(typingTimers.get(key));
    typingTimers.delete(key);

    if (!active) {
      set((state) => {
        const chatTyping = { ...(state.typing[chatId] ?? {}) };
        delete chatTyping[userId];
        return { typing: { ...state.typing, [chatId]: chatTyping } };
      });
      return;
    }

    set((state) => ({
      typing: {
        ...state.typing,
        [chatId]: {
          ...(state.typing[chatId] ?? {}),
          [userId]: { displayName, expiresAt: expiresAt ?? null },
        },
      },
    }));

    const ttl = expiresAt ? new Date(expiresAt).getTime() - Date.now() : TYPING_IDLE_MS;
    typingTimers.set(
      key,
      setTimeout(
        () => {
          typingTimers.delete(key);
          set((state) => {
            const chatTyping = { ...(state.typing[chatId] ?? {}) };
            delete chatTyping[userId];
            return { typing: { ...state.typing, [chatId]: chatTyping } };
          });
        },
        Math.max(600, ttl + 300),
      ),
    );
  },

  editMessage: async (messageId, body) => {
    const message = unwrap(await api.patch(`/messages/${messageId}`, { body }));
    get().applyUpdated(message);
    return message;
  },

  deleteMessage: async (messageId) => {
    const state = get();
    const payload = { messageId };
    await api.delete(`/messages/${messageId}`, { data: payload });
    const now = new Date().toISOString();
    set((current) => {
      const threads = { ...current.threads };
      let chatId = null;
      for (const [id, thread] of Object.entries(threads)) {
        if (thread.items.some((item) => item.id === messageId)) {
          chatId = id;
          threads[id] = {
            ...thread,
            items: thread.items.map((item) =>
              item.id === messageId
                ? { ...item, deletedAt: now, body: null, attachments: [], isPinned: false }
                : item,
            ),
          };
          break;
        }
      }
      if (!chatId) return {};
      return {
        threads,
        chats: current.chats.map((chat) =>
          chat.id === chatId && chat.lastMessage?.id === messageId
            ? {
                ...chat,
                lastMessage: {
                  ...chat.lastMessage,
                  deleted: true,
                  preview: 'Message deleted',
                  type: 'text',
                },
              }
            : chat,
        ),
        pins: {
          ...current.pins,
          [chatId]: (current.pins[chatId] ?? []).filter((item) => item.id !== messageId),
        },
      };
    });
    void state;
  },

  pinMessage: async (messageId) => {
    const data = unwrap(await api.post(`/messages/${messageId}/pin`));
    get().applyPinned(data);
    return data;
  },

  unpinMessage: async (messageId) => {
    const data = unwrap(await api.delete(`/messages/${messageId}/pin`));
    get().applyPinned(data);
    return data;
  },

  forwardMessage: async (messageId, chatId) => {
    const message = unwrap(await api.post(`/messages/${messageId}/forward`, { chatId }));
    set((state) => ({
      threads: state.threads[chatId]
        ? {
            ...state.threads,
            [chatId]: {
              ...state.threads[chatId],
              items: mergeMessage(state.threads[chatId].items, message),
            },
          }
        : state.threads,
      chats: bumpChat(state.chats, message),
    }));
    return message;
  },

  updatePreferences: async (chatId, preferences) => {
    const chat = unwrap(await api.patch(`/chats/${chatId}/preferences`, preferences));
    get().upsertChat(chat);
    return chat;
  },

  searchInChat: async (chatId, term) => {
    return unwrap(await api.get(`/chats/${chatId}/messages/search`, { params: { q: term } }));
  },

  searchAll: async (term) => {
    return unwrap(await api.get('/messages/search', { params: { q: term } }));
  },

  markAllThreadsRead: async (userId) => {
    const chats = get().chats;
    await Promise.allSettled(
      chats
        .filter((chat) => Number(chat.unread) > 0)
        .map((chat) => {
          const thread = get().threads[chat.id];
          const seq = thread ? latestSeq(thread.items) : chat.lastMessage?.seq;
          return seq ? get().markRead(chat.id, seq) : Promise.resolve();
        }),
    );
    void userId;
  },

  reset: () => {
    typingTimers.forEach((timer) => clearTimeout(timer));
    typingTimers.clear();
    typingIdleTimers.forEach((timer) => clearTimeout(timer));
    typingIdleTimers.clear();
    typingSentAt.clear();
    readPending.clear();
    set({
      chats: [],
      threads: {},
      pins: {},
      typing: {},
      drafts: {},
      activeChatId: null,
      loaded: false,
      loading: false,
      error: null,
    });
  },
}));

import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { connectSocket, emitEvent } from '../lib/socket';
import { getAccessToken } from '../lib/api';
import { playChime } from '../lib/utils';
import { useAuthStore } from '../stores/authStore';
import { useCallStore } from '../stores/callStore';
import { useChatStore } from '../stores/chatStore';
import { useFriendsStore } from '../stores/friendsStore';
import { useNotificationStore } from '../stores/notificationStore';
import { usePresenceStore } from '../stores/presenceStore';

const NOTIFICATION_ICONS = {
  friend_request: '👋',
  friend_accept: '🤝',
  message: '💬',
  missed_call: '📞',
  call_ended: '📞',
  system: '✨',
};

/**
 * Connects the realtime gateway once the user is authenticated and routes every
 * server event into the right store. Returns nothing — the UI reads stores.
 */
export function useSocketBridge() {
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status !== 'authenticated') return undefined;
    const socket = connectSocket(getAccessToken());
    if (!socket) return undefined;

    let connectedBefore = false;

    const detach = [];
    const on = (event, handler) => {
      socket.on(event, handler);
      detach.push(() => socket.off(event, handler));
    };

    on('connect', () => {
      // Deliver anything that failed while offline before refreshing threads.
      useChatStore
        .getState()
        .flushOutbox()
        .catch(() => {});
      if (connectedBefore) {
        useChatStore
          .getState()
          .refreshActive()
          .catch(() => {});
        useFriendsStore
          .getState()
          .fetchAll()
          .catch(() => {});
        useNotificationStore
          .getState()
          .fetchSummary()
          .catch(() => {});
      }
      connectedBefore = true;
    });

    on('session:ready', () => {
      useNotificationStore
        .getState()
        .fetchSummary()
        .catch(() => {});
    });

    on('session:error', ({ message } = {}) => {
      toast.error(message || 'The realtime session could not start.');
    });

    on('presence:snapshot', ({ friends } = {}) => {
      usePresenceStore.getState().replace(friends ?? []);
    });

    on('presence:update', (payload) => {
      usePresenceStore.getState().applyUpdate(payload);
    });

    on('typing:update', (payload) => {
      useChatStore.getState().applyTyping(payload);
    });

    on('message:new', (message) => {
      const chat = useChatStore.getState();
      const me = useAuthStore.getState().user;
      const settings = useAuthStore.getState().settings;
      chat.receiveMessage(message);
      const isMine = message.sender?.id === me?.id;
      const isActive = chat.activeChatId === message.chatId;
      const visible = document.visibilityState === 'visible';
      if (!isMine && (!isActive || !visible)) {
        if (settings?.notifications?.sounds !== false) playChime('message');
      }
    });

    on('message:updated', (message) => useChatStore.getState().applyUpdated(message));
    on('message:deleted', (message) => useChatStore.getState().applyDeleted(message));
    on('message:delivered', (payload) => useChatStore.getState().applyDelivered(payload));
    on('message:read', (payload) => useChatStore.getState().applyRead(payload));
    on('chat:read', (payload) => useChatStore.getState().applyChatRead(payload));
    on('message:pinned', (payload) => useChatStore.getState().applyPinned(payload));

    on('notification:new', (notification) => {
      useNotificationStore.getState().receive(notification);
      const settings = useAuthStore.getState().settings;
      if (settings?.notifications?.sounds !== false) playChime('message');

      const title = notification.payload?.title ?? 'New activity on DuoConnect';
      const body = notification.payload?.body ?? '';
      if (document.visibilityState !== 'visible') {
        toast(`${title}${body ? ` — ${body}` : ''}`, {
          icon: NOTIFICATION_ICONS[notification.type] ?? '✨',
          duration: 5000,
        });
      }

      if (
        settings?.notifications?.desktop &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        document.visibilityState !== 'visible'
      ) {
        try {
          const desktop = new Notification(title, {
            body,
            icon: '/favicon.svg',
            tag: notification.id,
          });
          desktop.onclick = () => {
            window.focus();
            desktop.close();
          };
        } catch {
          // Desktop notifications are best-effort.
        }
      }
    });

    on('notification:read', (payload) => useNotificationStore.getState().applyRead(payload));
    on('notification:read-all', () => useNotificationStore.getState().applyReadAll());
    on('notification:removed', (payload) => {
      if (payload?.id) {
        useNotificationStore.setState((state) => ({
          items: state.items.filter((item) => item.id !== payload.id),
        }));
      } else {
        useNotificationStore.getState().fetchSummary();
      }
    });

    on('friend:request:new', (request) => {
      useFriendsStore.getState().handleIncomingRequest(request);
      toast(`${request.user?.displayName ?? 'Someone'} wants to connect.`, { icon: '👋' });
    });
    on('friend:request:sent', (request) => {
      useFriendsStore.getState().handleOutgoingRequest(request);
    });
    on('friend:request:removed', (payload) => {
      useFriendsStore.getState().handleRequestRemoved(payload);
    });
    on('friend:accepted', async (payload) => {
      await useFriendsStore
        .getState()
        .fetchAll()
        .catch(() => {});
      useChatStore
        .getState()
        .fetchChats()
        .catch(() => {});
      toast(`You are now connected with ${payload?.user?.displayName ?? 'your new friend'}.`, {
        icon: '🤝',
      });
    });
    on('friend:removed', (payload) => {
      useFriendsStore.getState().handleFriendRemoved(payload);
      useChatStore
        .getState()
        .fetchChats()
        .catch(() => {});
    });
    on('contact:blocked', (payload) => {
      useFriendsStore.getState().handleBlocked(payload);
      useChatStore
        .getState()
        .fetchChats()
        .catch(() => {});
    });
    on('contact:blocked-you', (payload) => {
      useFriendsStore.getState().handleFriendRemoved(payload);
      useChatStore
        .getState()
        .fetchChats()
        .catch(() => {});
      toast('A contact is no longer available.', { icon: '⚠️' });
    });
    on('contact:unblocked', (payload) => {
      useFriendsStore.getState().handleUnblocked(payload);
    });

    on('call:incoming', (call) => useCallStore.getState().handleIncoming(call));
    on('call:accepted', (call) => useCallStore.getState().handleAccepted(call));
    on('call:signal', (payload) => {
      if (payload?.type === 'media') useCallStore.getState().applyRemoteMedia(payload.data ?? {});
      else useCallStore.getState().handleSignal(payload);
    });
    on('call:declined', (call) => useCallStore.getState().handleEnded(call, 'declined'));
    on('call:cancelled', (call) => useCallStore.getState().handleEnded(call, 'cancelled'));
    on('call:missed', (call) => useCallStore.getState().handleEnded(call, 'missed'));
    on('call:ended', (call) =>
      useCallStore
        .getState()
        .handleEnded(call, call?.endReason === 'connection_failed' ? 'connection_failed' : 'ended'),
    );

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') emitEvent('presence:set', { status: 'away' });
      else emitEvent('presence:set', { status: 'online' });
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onOnline = () => {
      useChatStore
        .getState()
        .flushOutbox()
        .catch(() => {});
    };
    window.addEventListener('online', onOnline);

    return () => {
      detach.forEach((off) => off());
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [status]);
}

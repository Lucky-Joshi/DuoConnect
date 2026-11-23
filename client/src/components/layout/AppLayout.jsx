import { useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Rail } from './Rail';
import { CallOverlay } from '../call/CallOverlay';
import { NewChatModal } from '../chat/NewChatModal';
import { ForwardModal } from '../chat/ForwardModal';
import { Lightbox } from '../ui/Lightbox';
import { useSocketBridge } from '../../hooks/useSocketBridge';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { useFriendsStore } from '../../stores/friendsStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useCallStore } from '../../stores/callStore';
import { useGameStore } from '../../stores/gameStore';
import { useUiStore } from '../../stores/uiStore';
import styles from './AppLayout.module.css';

let bootstrappedFor = null;

export default function AppLayout() {
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.user?.id);
  const setNewChatOpen = useUiStore((state) => state.setNewChatOpen);
  const overlays = useRef(null);

  useSocketBridge();

  useEffect(() => {
    if (status !== 'authenticated' || !userId) return;
    if (bootstrappedFor === userId) return;
    bootstrappedFor = userId;

    const chat = useChatStore.getState();
    const friends = useFriendsStore.getState();
    const notifications = useNotificationStore.getState();

    Promise.allSettled([chat.fetchChats(), friends.fetchAll(), notifications.fetch()]);
  }, [status, userId]);

  useEffect(() => {
    if (status !== 'authenticated') {
      bootstrappedFor = null;
      useChatStore.getState().reset();
      useFriendsStore.getState().reset();
      useNotificationStore.getState().reset();
      usePresenceStore.getState().reset();
      useCallStore.getState().reset();
      useGameStore.getState().reset();
    }
  }, [status]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setNewChatOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setNewChatOpen]);

  return (
    <div className={styles.shell} ref={overlays}>
      <a
        className="sr-only"
        href="#app-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('app-main')?.focus();
        }}
      >
        Skip to content
      </a>
      <Rail />
      <main id="app-main" className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>
      <CallOverlay />
      <NewChatModal onOpenChat={(chatId) => navigate(`/app/c/${chatId}`)} />
      <ForwardModal />
      <Lightbox />
    </div>
  );
}

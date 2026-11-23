import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowLeft,
  Bell,
  BellOff,
  Gamepad2,
  Images,
  Info,
  MessageSquare,
  Phone,
  Pin,
  PinOff,
  Search,
  Trophy,
  UserRound,
  Users,
  Video,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Avatar, Button, EmptyState, IconButton, Skeleton, Spinner } from '../ui/Primitives';
import { Modal } from '../ui/Modal';
import { MessageBubble } from './MessageBubble';
import { Composer } from './Composer';
import { GamePanel } from './GamePanel';
import { api, unwrap } from '../../lib/api';
import { conversationParticipant } from '../../lib/conversation';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { useChatStore } from '../../stores/chatStore';
import { useGameStore } from '../../stores/gameStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useUiStore } from '../../stores/uiStore';
import {
  cn,
  formatChatTimestamp,
  formatDayLabel,
  getErrorMessage,
  isImageAttachment,
  mediaUrl,
  messagePreview,
  presenceLabel,
  sameDay,
} from '../../lib/utils';
import styles from './ChatThread.module.css';

const GROUP_GAP_MS = 5 * 60 * 1000;
const EMPTY_ITEMS = [];

const READ_ONLY = {
  blocked_by_me: 'You blocked this person. Unblock them from their profile to keep chatting.',
  blocked_me:
    'This conversation is read-only because you are no longer able to message this person.',
  not_friends:
    'You are no longer connected. Send a new friend request to keep the conversation going.',
  peer_missing: 'This conversation is no longer available.',
};

function buildRows(items, meId) {
  const rows = [];
  for (let index = 0; index < items.length; index += 1) {
    const message = items[index];
    const previous = items[index - 1];
    const next = items[index + 1];
    const newDay = !previous || !sameDay(previous.createdAt, message.createdAt);
    const follows =
      Boolean(previous) &&
      !newDay &&
      previous.sender?.id === message.sender?.id &&
      new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < GROUP_GAP_MS;
    const continues =
      Boolean(next) &&
      sameDay(message.createdAt, next.createdAt) &&
      next.sender?.id === message.sender?.id &&
      new Date(next.createdAt).getTime() - new Date(message.createdAt).getTime() < GROUP_GAP_MS;

    rows.push({
      message,
      day: newDay ? formatDayLabel(message.createdAt) : null,
      own: message.sender?.id === meId,
      showAvatar: !follows,
      isLastInGroup: !continues,
    });
  }
  return rows;
}

function typingLabel(typing) {
  const names = Object.values(typing ?? {})
    .map((entry) => entry.displayName?.split(' ')[0])
    .filter(Boolean);
  if (!names.length) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return 'Several people are typing…';
}

function DetailsDrawer({
  open,
  onClose,
  chat,
  members,
  pins,
  items,
  onJump,
  history = [],
  gameStats = [],
}) {
  const navigate = useNavigate();
  const openLightbox = useUiStore((state) => state.openLightbox);
  const updatePreferences = useChatStore((state) => state.updatePreferences);
  const me = useAuthStore((state) => state.user);
  const other = chat?.otherUser;
  const title = other?.displayName ?? chat?.name ?? 'Conversation';
  const participant = conversationParticipant(other, members, me?.id);

  const images = useMemo(
    () =>
      (items ?? [])
        .filter((message) => !message.deletedAt)
        .flatMap((message) => message.attachments ?? [])
        .filter(isImageAttachment)
        .slice(-12)
        .reverse(),
    [items],
  );

  const setPreference = async (patch, label) => {
    try {
      await updatePreferences(chat.id, patch);
      toast.success(label);
    } catch (error) {
      toast.error(getErrorMessage(error, 'That preference could not be saved.'));
    }
  };

  const openImage = (index) =>
    openLightbox(
      images.map((image) => ({ ...image, url: mediaUrl(image.url) })),
      index,
    );

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            className={styles.drawerBackdrop}
            aria-label="Close conversation details"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className={styles.drawer}
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            aria-label="Conversation details"
          >
            <header className={styles.drawerHead}>
              <h2>Conversation</h2>
              <IconButton label="Close details" size="sm" onClick={onClose}>
                <X size={17} />
              </IconButton>
            </header>

            <div className={styles.drawerScroll}>
              <section className={styles.profileCard}>
                <Avatar user={participant} size="xl" ring />
                <h3>{title}</h3>
                <p>
                  {other?.username ? `@${other.username}` : `${members.length || 2} members`}
                  {other?.about ? ` · ${other.about}` : ''}
                </p>
                <div className={styles.profileActions}>
                  {other ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={UserRound}
                      onClick={() => {
                        onClose();
                        navigate(`/app/u/${other.username}`);
                      }}
                    >
                      Profile
                    </Button>
                  ) : null}
                  {chat?.canMessage ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Phone}
                      onClick={() => {
                        onClose();
                        useCallStore.getState().startCall(chat, 'audio');
                      }}
                    >
                      Call
                    </Button>
                  ) : null}
                </div>
              </section>

              <section className={styles.drawerSection}>
                <span className={styles.drawerLabel}>Preferences</span>
                <button
                  type="button"
                  className={styles.drawerRow}
                  onClick={() =>
                    setPreference(
                      { muted: !chat.muted },
                      chat.muted ? 'Notifications on' : 'Notifications muted',
                    )
                  }
                >
                  <span className={cn(styles.drawerRowIcon, chat.muted && styles.drawerRowActive)}>
                    {chat.muted ? <BellOff size={16} /> : <Bell size={16} />}
                  </span>
                  <span className={styles.drawerRowText}>
                    <strong>{chat.muted ? 'Unmute conversation' : 'Mute conversation'}</strong>
                    <span>
                      {chat.muted ? 'You are not being notified' : 'Keep notifications on'}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.drawerRow}
                  onClick={() =>
                    setPreference(
                      { pinned: !chat.pinned },
                      chat.pinned ? 'Conversation unpinned' : 'Conversation pinned',
                    )
                  }
                >
                  <span className={cn(styles.drawerRowIcon, chat.pinned && styles.drawerRowActive)}>
                    {chat.pinned ? <PinOff size={16} /> : <Pin size={16} />}
                  </span>
                  <span className={styles.drawerRowText}>
                    <strong>{chat.pinned ? 'Unpin conversation' : 'Pin conversation'}</strong>
                    <span>
                      {chat.pinned
                        ? 'Movable back into the list'
                        : 'Keep it at the top of your list'}
                    </span>
                  </span>
                </button>
              </section>

              {members.length > 1 ? (
                <section className={styles.drawerSection}>
                  <span className={styles.drawerLabel}>
                    <Users size={13} /> Members · {members.length}
                  </span>
                  <ul className={styles.memberList}>
                    {members.map((member) => (
                      <li key={member.id}>
                        <button
                          type="button"
                          className={styles.memberRow}
                          onClick={() => {
                            onClose();
                            navigate(`/app/u/${member.username}`);
                          }}
                        >
                          <Avatar user={member} size="sm" showStatus status={member.status} />
                          <span>
                            <strong>{member.displayName}</strong>
                            <span>@{member.username}</span>
                          </span>
                          <span className={styles.memberRole}>{member.role}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className={styles.drawerSection}>
                <span className={styles.drawerLabel}>
                  <Images size={13} /> Shared media
                </span>
                {images.length ? (
                  <div className={styles.mediaGrid}>
                    {images.map((image, index) => (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => openImage(index)}
                        aria-label={`Open ${image.name || 'shared photo'}`}
                      >
                        <img src={mediaUrl(image.url)} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className={styles.drawerEmpty}>Photos you share will collect here.</p>
                )}
              </section>

              <section className={styles.drawerSection}>
                <span className={styles.drawerLabel}>
                  <Pin size={13} /> Pinned · {pins.length}
                </span>
                {pins.length ? (
                  <ul className={styles.pinList}>
                    {pins.map((pin) => (
                      <li key={pin.id}>
                        <button
                          type="button"
                          className={styles.pinRow}
                          onClick={() => {
                            onClose();
                            onJump(pin.id, pin.seq);
                          }}
                        >
                          <Pin size={12} />
                          <span>
                            <strong>{pin.sender?.displayName ?? 'Message'}</strong>
                            <span>{messagePreview(pin)}</span>
                          </span>
                          <time>{formatChatTimestamp(pin.createdAt)}</time>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.drawerEmpty}>Pin a message to keep it close at hand.</p>
                )}
              </section>

              <section className={styles.drawerSection}>
                <span className={styles.drawerLabel}>
                  <Trophy size={13} /> Games
                </span>
                {gameStats.length ? (
                  <div className={styles.gameStatsGrid}>
                    {gameStats.map((stat) => (
                      <div key={stat.type} className={styles.gameStatCard}>
                        <strong>
                          {stat.type === 'drawguess' ? 'Draw & Guess' : 'Tic-Tac-Toe'}
                        </strong>
                        <span>
                          W {stat.wins} · L {stat.losses} · D {stat.draws}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.drawerEmpty}>No completed games yet.</p>
                )}
                {history.length ? (
                  <ul className={styles.pinList}>
                    {history.slice(0, 8).map((game) => (
                      <li key={game.id}>
                        <button
                          type="button"
                          className={styles.pinRow}
                          onClick={() => {
                            useGameStore.getState().setOpenGame(game.id);
                            onClose();
                          }}
                        >
                          <Gamepad2 size={12} />
                          <span>
                            <strong>
                              {game.type === 'drawguess' ? 'Draw & Guess' : 'Tic-Tac-Toe'}
                            </strong>
                            <span>
                              {game.status === 'completed'
                                ? game.result === 'draw'
                                  ? 'Draw'
                                  : game.winnerId === chat?.otherUser?.id
                                    ? `${game.winner?.displayName || 'Opponent'} won`
                                    : 'You won'
                                : game.status}
                            </span>
                          </span>
                          <time>{formatChatTimestamp(game.createdAt)}</time>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function ThreadSkeleton() {
  return (
    <div className={styles.skeletonList} aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6].map((row) => (
        <div className={cn(styles.skeletonRow, row % 3 === 0 && styles.skeletonOwn)} key={row}>
          <Skeleton
            width={row % 3 === 0 ? '42%' : '56%'}
            height={row % 4 === 0 ? 64 : 42}
            radius={16}
          />
        </div>
      ))}
    </div>
  );
}

export function ChatThread({ chatId }) {
  const navigate = useNavigate();
  const me = useAuthStore((state) => state.user);
  const chats = useChatStore((state) => state.chats);
  const thread = useChatStore((state) => state.threads[chatId]);
  const pins = useChatStore((state) => state.pins[chatId]) ?? EMPTY_ITEMS;
  const typing = useChatStore((state) => state.typing[chatId]);
  const presence = usePresenceStore((state) => state.byId);
  const callStatus = useCallStore((state) => state.status);
  const activeGame = useGameStore((state) => state.activeByChat[chatId]);
  const openGameId = useGameStore((state) => state.openGameId);
  const history = useGameStore((state) => state.historyByChat[chatId]) ?? EMPTY_ITEMS;
  const gameStats = useGameStore((state) => state.statsByChat[chatId]) ?? EMPTY_ITEMS;

  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const [pendingJump, setPendingJump] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pinsHidden, setPinsHidden] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [dismissedGameId, setDismissedGameId] = useState(null);

  const scrollRef = useRef(null);
  const refs = useRef(new Map());
  const atBottomRef = useRef(true);
  const previousCount = useRef({ chatId: null, count: 0 });
  const searchInputRef = useRef(null);

  const chat = chats.find((item) => item.id === chatId) ?? null;
  const other = chat?.otherUser ?? null;
  const items = thread?.items ?? EMPTY_ITEMS;
  const loaded = Boolean(thread?.loaded);
  const rows = useMemo(() => buildRows(items, me?.id), [items, me?.id]);
  const latest = items[items.length - 1] ?? null;
  const latestSeq = Number(latest?.seq) || 0;
  const otherPresence = other
    ? (presence[other.id]?.status ?? other.status ?? 'offline')
    : 'offline';
  const typingText = typingLabel(typing);
  const readOnlyReason =
    chat && !chat.canMessage
      ? (READ_ONLY[chat.accessReason] ?? 'This conversation is read-only.')
      : null;
  const callBusy = !['idle', 'ended'].includes(callStatus);
  const title = other?.displayName ?? chat?.name ?? 'Conversation';
  const onlineLabel = other
    ? presenceLabel(otherPresence, presence[other.id]?.lastSeenAt ?? other.lastSeenAt)
    : '';

  /* Open + close the thread ------------------------------------------------ */
  useEffect(() => {
    let active = true;
    setReplyTo(null);
    setEditing(null);
    setDetailsOpen(false);
    setMembers([]);
    setSearchOpen(false);
    setSearchTerm('');
    setSearchResults([]);
    setHighlightId(null);
    setPendingJump(null);
    setPinsHidden(false);
    setAtBottom(true);
    setDismissedGameId(null);
    useGameStore.getState().setOpenGame(null);

    useChatStore
      .getState()
      .openChat(chatId)
      .catch((error) => {
        if (active) toast.error(getErrorMessage(error, 'This conversation could not be opened.'));
      });
    useGameStore
      .getState()
      .fetchActive(chatId)
      .catch(() => {});

    return () => {
      active = false;
      useChatStore.getState().closeChat();
    };
  }, [chatId]);

  /* Keep the latest message in view --------------------------------------- */
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
    atBottomRef.current = true;
    setAtBottom(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const frame = requestAnimationFrame(() => scrollToBottom('auto'));
    const timer = setTimeout(() => {
      const element = scrollRef.current;
      if (!element) return;
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      if (distance > 4 && atBottomRef.current) scrollToBottom('auto');
    }, 90);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [chatId, loaded, scrollToBottom]);

  const messageCount = items.length;

  useEffect(() => {
    if (!loaded) return;
    const previous = previousCount.current;
    if (previous.chatId !== chatId) {
      previousCount.current = { chatId, count: messageCount };
      return;
    }
    const grew = messageCount > previous.count;
    previousCount.current = { chatId, count: messageCount };
    if (!grew) return;
    if (atBottomRef.current || latest?.sender?.id === me?.id) scrollToBottom('smooth');
  }, [chatId, messageCount, loaded, latest, me?.id, scrollToBottom]);

  /* Read receipts ---------------------------------------------------------- */
  useEffect(() => {
    if (!loaded || !latestSeq) return undefined;
    const mark = () => {
      if (document.visibilityState === 'visible') {
        useChatStore.getState().markRead(chatId, latestSeq);
      }
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [chatId, loaded, latestSeq]);

  /* Infinite scroll -------------------------------------------------------- */
  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const nextAtBottom = distance < 120;
    if (nextAtBottom !== atBottomRef.current) {
      atBottomRef.current = nextAtBottom;
      setAtBottom(nextAtBottom);
    }

    if (element.scrollTop < 140 && thread?.hasMore && !thread.loadingOlder) {
      const previousHeight = element.scrollHeight;
      const previousTop = element.scrollTop;
      useChatStore
        .getState()
        .loadOlder(chatId)
        .then(() => {
          requestAnimationFrame(() => {
            const node = scrollRef.current;
            if (!node) return;
            node.scrollTop = node.scrollHeight - previousHeight + previousTop;
          });
        })
        .catch(() => {});
    }
  };

  /* Jump to a message ------------------------------------------------------ */
  const jumpTo = useCallback(
    async (messageId, seq) => {
      setSearchOpen(false);
      const node = refs.current.get(messageId);
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightId(messageId);
        return;
      }
      if (seq) {
        try {
          await useChatStore.getState().loadMessages(chatId, { around: Number(seq) });
          setPendingJump({ id: messageId });
        } catch (error) {
          toast.error(getErrorMessage(error, 'That message could not be loaded.'));
        }
        return;
      }
      toast('That message is not loaded yet. Scroll up to find it.', { icon: '🔎' });
    },
    [chatId],
  );

  useEffect(() => {
    if (!pendingJump) return;
    const node = refs.current.get(pendingJump.id);
    if (!node) return;
    setPendingJump(null);
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(pendingJump.id);
  }, [pendingJump, rows]);

  useEffect(() => {
    if (!highlightId) return undefined;
    const timer = setTimeout(() => setHighlightId(null), 2400);
    return () => clearTimeout(timer);
  }, [highlightId]);

  /* In-chat search --------------------------------------------------------- */
  useEffect(() => {
    if (!searchOpen) return undefined;
    const term = searchTerm.trim();
    if (term.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await useChatStore.getState().searchInChat(chatId, term);
        if (!cancelled) setSearchResults(results ?? []);
      } catch (error) {
        if (!cancelled) toast.error(getErrorMessage(error, 'Searching this conversation failed.'));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chatId, searchOpen, searchTerm]);

  const toggleSearch = () => {
    setSearchOpen((open) => {
      const next = !open;
      if (next) setTimeout(() => searchInputRef.current?.focus(), 40);
      else {
        setSearchTerm('');
        setSearchResults([]);
      }
      return next;
    });
  };

  /* Chat details ----------------------------------------------------------- */
  const openDetails = async () => {
    const next = !detailsOpen;
    setDetailsOpen(next);
    if (!next) return;
    if (!members.length) {
      try {
        const data = unwrap(await api.get(`/chats/${chatId}`));
        if (data?.members) setMembers(data.members);
        if (data?.chat) useChatStore.getState().upsertChat(data.chat);
      } catch {
        // The summary already gives us enough to show the drawer.
      }
    }
    useGameStore
      .getState()
      .fetchHistory(chatId)
      .catch(() => {});
    useGameStore
      .getState()
      .fetchStats(chatId)
      .catch(() => {});
  };

  /* Message actions -------------------------------------------------------- */
  const pinMessage = async (message) => {
    try {
      await useChatStore.getState().pinMessage(message.id);
      toast.success('Message pinned.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'The message could not be pinned.'));
    }
  };

  const unpinMessage = async (message) => {
    try {
      await useChatStore.getState().unpinMessage(message.id);
      toast.success('Message unpinned.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'The message could not be unpinned.'));
    }
  };

  const deleteMessage = async () => {
    if (!pendingDelete) return;
    const message = pendingDelete;
    setPendingDelete(null);
    try {
      await useChatStore.getState().deleteMessage(message.id);
      toast.success('Message deleted.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'The message could not be deleted.'));
    }
  };

  const retry = async (message) => {
    try {
      await useChatStore.getState().retryMessage(chatId, message);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Your message could not be sent.'));
    }
  };

  const startCall = (kind) => {
    if (!chat || !chat.canMessage || callBusy) return;
    useCallStore.getState().startCall(chat, kind);
  };

  const latestPin = pins[0] ?? null;
  const showPins = Boolean(latestPin) && !pinsHidden;
  const panelGame = useMemo(() => {
    if (openGameId) {
      const fromActive = activeGame?.id === openGameId ? activeGame : null;
      const fromHistory = history.find((g) => g.id === openGameId) ?? null;
      const found = fromActive || fromHistory;
      if (found?.chatId === chatId) return found;
    }
    if (activeGame && dismissedGameId !== activeGame.id) return activeGame;
    return null;
  }, [openGameId, activeGame, history, chatId, dismissedGameId]);

  useEffect(() => {
    if (!openGameId) return;
    const inStore =
      (activeGame?.id === openGameId && activeGame.chatId === chatId) ||
      history.some((g) => g.id === openGameId);
    if (inStore) return;
    let cancelled = false;
    api
      .get(`/games/${openGameId}`)
      .then(unwrap)
      .then((game) => {
        if (!cancelled && game?.chatId === chatId) useGameStore.getState().upsertGame(game);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [openGameId, activeGame, history, chatId]);

  return (
    <section className={styles.thread} aria-label={`Conversation with ${title}`}>
      <header className={styles.header}>
        <IconButton
          label="Back to conversations"
          size="sm"
          className={styles.back}
          onClick={() => navigate('/app')}
        >
          <ArrowLeft size={19} />
        </IconButton>

        <button type="button" className={styles.identity} onClick={openDetails}>
          <Avatar user={other ?? chat} size="md" showStatus status={otherPresence} />
          <span className={styles.identityText}>
            <strong>{title}</strong>
            <span className={cn(styles.identityStatus, typingText && styles.identityTyping)}>
              {typingText || (other ? onlineLabel : `${chat?.membersCount ?? 2} members`)}
            </span>
          </span>
        </button>

        <div className={styles.headerActions}>
          <IconButton label="Search this conversation" active={searchOpen} onClick={toggleSearch}>
            <Search size={18} />
          </IconButton>
          <IconButton
            label="Start an audio call"
            onClick={() => startCall('audio')}
            disabled={!chat?.canMessage || callBusy}
          >
            <Phone size={18} />
          </IconButton>
          <IconButton
            label="Start a video call"
            onClick={() => startCall('video')}
            disabled={!chat?.canMessage || callBusy || chat?.kind !== 'direct'}
          >
            <Video size={18} />
          </IconButton>
          <IconButton label="Conversation details" active={detailsOpen} onClick={openDetails}>
            <Info size={18} />
          </IconButton>
        </div>
      </header>

      <AnimatePresence>
        {searchOpen ? (
          <motion.div
            className={styles.searchPanel}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={styles.searchBar}>
              <Search size={16} />
              <input
                ref={searchInputRef}
                type="search"
                value={searchTerm}
                placeholder="Search this conversation"
                onChange={(event) => setSearchTerm(event.target.value)}
                aria-label="Search this conversation"
              />
              {searching ? <Spinner size={14} /> : null}
              <button type="button" onClick={toggleSearch} aria-label="Close search">
                <X size={15} />
              </button>
            </div>
            {searchTerm.trim().length >= 2 ? (
              <div className={styles.searchResults}>
                {searchResults.length ? (
                  searchResults.map((result) => (
                    <button
                      type="button"
                      key={result.id}
                      className={styles.searchResult}
                      onClick={() => jumpTo(result.id, result.seq)}
                    >
                      <span className={styles.searchResultIcon}>
                        <MessageSquare size={14} />
                      </span>
                      <span className={styles.searchResultBody}>
                        <strong>{result.sender?.displayName ?? 'Message'}</strong>
                        <span>{messagePreview(result)}</span>
                      </span>
                      <time>{formatChatTimestamp(result.createdAt)}</time>
                    </button>
                  ))
                ) : (
                  <p className={styles.searchEmpty}>
                    {searching
                      ? 'Looking through this conversation…'
                      : 'No messages match that search.'}
                  </p>
                )}
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {showPins ? (
        <div className={styles.pinBar}>
          <span className={styles.pinBarIcon}>
            <Pin size={14} />
          </span>
          <button
            type="button"
            className={styles.pinBarBody}
            onClick={() => jumpTo(latestPin.id, latestPin.seq)}
          >
            <strong>{latestPin.sender?.displayName ?? 'Pinned message'}</strong>
            <span>{messagePreview(latestPin)}</span>
          </button>
          {pins.length > 1 ? <span className={styles.pinCount}>+{pins.length - 1}</span> : null}
          <IconButton
            label="Dismiss pinned messages"
            size="sm"
            className={styles.pinBarClose}
            onClick={() => setPinsHidden(true)}
          >
            <X size={14} />
          </IconButton>
        </div>
      ) : null}

      <div className={styles.scroll} ref={scrollRef} onScroll={handleScroll}>
        <div className={styles.scrollInner}>
          {thread?.loading && !loaded ? (
            <ThreadSkeleton />
          ) : thread?.error && !loaded ? (
            <EmptyState
              icon={MessageSquare}
              title="This conversation did not load"
              description="Check your connection and try again — your messages are safe."
              className={styles.state}
            >
              <Button size="sm" onClick={() => useChatStore.getState().loadMessages(chatId)}>
                Try again
              </Button>
            </EmptyState>
          ) : !items.length ? (
            <EmptyState
              icon={MessageSquare}
              title={
                other
                  ? `Say hello to ${other.displayName?.split(' ')[0] ?? 'them'}`
                  : 'Start the conversation'
              }
              description={
                readOnlyReason ??
                'This is the beginning of your conversation. Send a message, a photo, or a voice note to get things going.'
              }
              className={styles.state}
            />
          ) : (
            <>
              {thread?.loadingOlder ? (
                <div className={styles.olderLoader}>
                  <Spinner size={15} /> Loading earlier messages…
                </div>
              ) : thread?.hasMore ? (
                <button
                  type="button"
                  className={styles.loadOlder}
                  onClick={() => useChatStore.getState().loadOlder(chatId)}
                >
                  Show earlier messages
                </button>
              ) : (
                <div className={styles.beginning}>
                  <span>This is the very beginning of your conversation</span>
                </div>
              )}

              {rows.map((row) => (
                <Fragment key={row.message.id}>
                  {row.day ? (
                    <div className={styles.day}>
                      <span>{row.day}</span>
                    </div>
                  ) : null}
                  <MessageBubble
                    message={row.message}
                    own={row.own}
                    showAvatar={row.showAvatar}
                    isLastInGroup={row.isLastInGroup}
                    canMessage={Boolean(chat?.canMessage)}
                    highlighted={highlightId === row.message.id}
                    currentUserId={me?.id}
                    onReact={(message, emoji) =>
                      useChatStore.getState().toggleReaction(message.id, emoji)
                    }
                    onReply={(message) => {
                      setEditing(null);
                      setReplyTo(message);
                    }}
                    onEdit={(message) => {
                      setReplyTo(null);
                      setEditing(message);
                      useChatStore.getState().setDraft(chatId, message.body ?? '');
                    }}
                    onDelete={(message) => setPendingDelete(message)}
                    onPin={pinMessage}
                    onUnpin={unpinMessage}
                    onForward={(message) => useUiStore.getState().openForward(message)}
                    onRetry={retry}
                    onJumpTo={jumpTo}
                    registerRef={(node) => {
                      if (node) refs.current.set(row.message.id, node);
                      else refs.current.delete(row.message.id);
                    }}
                  />
                </Fragment>
              ))}
            </>
          )}
        </div>
      </div>

      <div className={styles.bottomLayer}>
        <AnimatePresence>
          {!atBottom && loaded && items.length ? (
            <motion.button
              type="button"
              className={styles.jumpLatest}
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.9 }}
              onClick={() => {
                if (thread?.hasMoreNewer)
                  useChatStore
                    .getState()
                    .loadMessages(chatId)
                    .then(() => scrollToBottom('auto'));
                else scrollToBottom('smooth');
              }}
              aria-label="Jump to the latest message"
            >
              <ArrowDown size={16} />
              {thread?.hasMoreNewer ? 'Back to latest' : 'Latest messages'}
            </motion.button>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {typingText ? (
            <motion.div
              className={styles.typing}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              aria-live="polite"
            >
              <span className={styles.typingDots} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {typingText}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {panelGame ? (
          <GamePanel
            game={panelGame}
            onClose={() => {
              if (openGameId) useGameStore.getState().setOpenGame(null);
              else setDismissedGameId(panelGame.id);
            }}
          />
        ) : null}

        <Composer
          chatId={chatId}
          chat={chat}
          replyTo={replyTo}
          editing={editing}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => {
            setEditing(null);
            useChatStore.getState().clearDraft(chatId);
          }}
          onSent={() => scrollToBottom('smooth')}
          disabled={!chat?.canMessage}
          readOnlyReason={readOnlyReason}
        />
      </div>

      <DetailsDrawer
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        chat={chat}
        members={members.length ? members : other ? [{ ...other, role: 'member' }] : []}
        pins={pins}
        items={items}
        onJump={jumpTo}
        history={history}
        gameStats={gameStats}
      />

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete this message?"
        description="It will be removed for both of you. This cannot be undone."
        size="sm"
        footer={
          <div className={styles.confirmActions}>
            <Button variant="ghost" size="sm" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={deleteMessage}>
              Delete message
            </Button>
          </div>
        }
      >
        <p className={styles.confirmText}>{pendingDelete ? messagePreview(pendingDelete) : ''}</p>
      </Modal>
    </section>
  );
}

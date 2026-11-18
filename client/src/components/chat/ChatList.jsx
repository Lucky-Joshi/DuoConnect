import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BellOff,
  MessageCircle,
  MessageCirclePlus,
  Pin,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  IconButton,
  Segmented,
  Skeleton,
} from '../ui/Primitives';
import { Panel, PanelFooter, PanelHeader, PanelScroll, PanelSearch } from '../layout/Panel';
import { useChatStore } from '../../stores/chatStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useUiStore } from '../../stores/uiStore';
import { cn, formatChatTimestamp, presenceLabel } from '../../lib/utils';
import styles from './ChatList.module.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
];

function sortChats(chats) {
  return [...chats].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aTime = new Date(a.lastMessage?.createdAt ?? a.updatedAt ?? a.createdAt ?? 0).getTime();
    const bTime = new Date(b.lastMessage?.createdAt ?? b.updatedAt ?? b.createdAt ?? 0).getTime();
    return bTime - aTime;
  });
}

export function ChatList() {
  const navigate = useNavigate();
  const { chatId } = useParams();
  const chats = useChatStore((state) => state.chats);
  const loaded = useChatStore((state) => state.loaded);
  const loading = useChatStore((state) => state.loading);
  const typing = useChatStore((state) => state.typing);
  const activeChatId = useChatStore((state) => state.activeChatId);
  const presence = usePresenceStore((state) => state.byId);
  const setNewChatOpen = useUiStore((state) => state.setNewChatOpen);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sortChats(chats).filter((chat) => {
      if (filter === 'unread' && !(Number(chat.unread) > 0)) return false;
      if (!term) return true;
      const name = chat.otherUser?.displayName ?? chat.name ?? '';
      const username = chat.otherUser?.username ?? '';
      return `${name} ${username} ${chat.lastMessage?.preview ?? ''}`.toLowerCase().includes(term);
    });
  }, [chats, filter, query]);

  const unreadCount = chats.reduce((sum, chat) => sum + (Number(chat.unread) || 0), 0);
  const activeId = chatId ?? activeChatId;

  const open = (id) => {
    navigate(`/app/c/${id}`);
  };

  return (
    <Panel className={styles.panel}>
      <PanelHeader
        title="Messages"
        subtitle={
          loading && !loaded
            ? 'Syncing your conversations…'
            : unreadCount
              ? `${unreadCount} unread ${unreadCount === 1 ? 'message' : 'messages'}`
              : 'Everything is caught up'
        }
        actions={
          <IconButton
            label="Start a new conversation"
            onClick={() => setNewChatOpen(true)}
            tone="accent"
          >
            <MessageCirclePlus size={18} />
          </IconButton>
        }
      />

      <PanelSearch
        value={query}
        onChange={setQuery}
        onClear={() => setQuery('')}
        placeholder="Search conversations"
      >
        <Search size={15} />
      </PanelSearch>

      <div className={styles.filters}>
        <Segmented options={FILTERS} value={filter} onChange={setFilter} size="sm" />
        {unreadCount ? (
          <button
            type="button"
            className={styles.markAll}
            onClick={() => useChatStore.getState().markAllThreadsRead()}
          >
            Mark all read
          </button>
        ) : null}
      </div>

      <PanelScroll className={styles.list}>
        {!loaded && loading ? (
          <div className={styles.skeletons} aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <div className={styles.skeletonRow} key={row}>
                <Skeleton width={46} height={46} radius={999} />
                <span className={styles.skeletonText}>
                  <Skeleton width="48%" height={12} />
                  <Skeleton width="72%" height={10} />
                </span>
              </div>
            ))}
          </div>
        ) : filtered.length ? (
          <ul className={styles.items}>
            {filtered.map((chat) => {
              const other = chat.otherUser;
              const personTyping = Object.values(typing[chat.id] ?? {});
              const online = presence[other?.id]?.status ?? other?.status;
              const displayName = other?.displayName ?? chat.name ?? 'Conversation';
              const unread = Number(chat.unread) || 0;
              const active = activeId === chat.id;

              return (
                <li key={chat.id}>
                  <button
                    type="button"
                    className={cn(
                      styles.item,
                      active && styles.itemActive,
                      unread > 0 && styles.itemUnread,
                    )}
                    onClick={() => open(chat.id)}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className={styles.avatarWrap}>
                      <Avatar user={other} size="md" showStatus status={online} />
                      {chat.pinned ? (
                        <span className={styles.pinBadge} aria-label="Pinned conversation">
                          <Pin size={9} />
                        </span>
                      ) : null}
                    </span>

                    <span className={styles.body}>
                      <span className={styles.topLine}>
                        <strong>{displayName}</strong>
                        <span className={styles.time}>
                          {formatChatTimestamp(chat.lastMessage?.createdAt ?? chat.updatedAt)}
                        </span>
                      </span>
                      <span className={styles.bottomLine}>
                        <span
                          className={cn(
                            styles.preview,
                            personTyping.length && styles.typingPreview,
                          )}
                        >
                          {personTyping.length
                            ? `${personTyping[0].displayName?.split(' ')[0] ?? 'Someone'} is typing…`
                            : chat.lastMessage
                              ? `${chat.lastMessage.senderId === chat.otherUser?.id ? '' : 'You: '}${chat.lastMessage.preview}`
                              : other
                                ? presenceLabel(online, presence[other.id]?.lastSeenAt) ===
                                  'Online now'
                                  ? 'Say hello — you are connected'
                                  : presenceLabel(online, presence[other.id]?.lastSeenAt)
                                : 'No messages yet'}
                        </span>
                        <span className={styles.meta}>
                          {chat.muted ? <BellOff size={12} aria-label="Muted" /> : null}
                          {unread > 0 ? (
                            <Badge count={unread} tone={chat.muted ? 'success' : 'accent'} />
                          ) : null}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : query || filter === 'unread' ? (
          <EmptyState
            compact
            icon={query ? Search : MessageCircle}
            title={query ? 'No conversations found' : 'You are all caught up'}
            description={
              query
                ? 'Try a different name, username, or message preview.'
                : 'New messages will show up here when someone reaches out.'
            }
          >
            {query ? (
              <Button variant="ghost" size="sm" onClick={() => setQuery('')}>
                Clear search
              </Button>
            ) : null}
          </EmptyState>
        ) : (
          <EmptyState
            icon={MessageCircle}
            title="Your quiet corner is ready"
            description="Start a conversation with someone you are connected with. Everything stays between the two of you."
          >
            <Button icon={UserPlus} size="sm" onClick={() => navigate('/app/friends')}>
              Find people
            </Button>
          </EmptyState>
        )}
      </PanelScroll>

      <PanelFooter>
        <div className={styles.footer}>
          <span className={styles.footerIcon}>
            <Users size={15} />
          </span>
          <div className={styles.footerText}>
            <strong>Only real connections</strong>
            <span>Chats unlock when you both accept.</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/app/friends')}>
            People
          </Button>
        </div>
      </PanelFooter>
    </Panel>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  BellRing,
  CheckCheck,
  Inbox,
  MessageCircle,
  PhoneCall,
  PhoneMissed,
  RefreshCw,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Screen, ScreenHeader, ScreenBody, Section, Card } from '../components/layout/Screen';
import {
  Avatar,
  Button,
  EmptyState,
  IconButton,
  Segmented,
  Skeleton,
} from '../components/ui/Primitives';
import { useNotificationStore } from '../stores/notificationStore';
import { formatDayLabel, formatRelative, formatTime, getErrorMessage } from '../lib/utils';
import styles from './NotificationsPage.module.css';

const TYPE_META = {
  friend_request: { icon: UserPlus, tone: 'accent', label: 'Connection request' },
  friend_accept: { icon: UserCheck, tone: 'success', label: 'New connection' },
  message: { icon: MessageCircle, tone: 'accent', label: 'Message' },
  missed_call: { icon: PhoneMissed, tone: 'warn', label: 'Missed call' },
  call_ended: { icon: PhoneCall, tone: 'neutral', label: 'Call' },
  system: { icon: Sparkles, tone: 'neutral', label: 'Update' },
};

const FALLBACK = { icon: Bell, tone: 'neutral', label: 'Activity' };

function routeFor(notification) {
  switch (notification.type) {
    case 'friend_request':
      return '/app/friends?tab=requests';
    case 'friend_accept':
      return notification.payload?.chatId
        ? `/app/c/${notification.payload.chatId}`
        : '/app/friends?tab=connections';
    case 'message':
      return notification.chatId ? `/app/c/${notification.chatId}` : null;
    case 'missed_call':
    case 'call_ended':
      return '/app/calls';
    default:
      return null;
  }
}

function titleFor(notification, meta) {
  return notification.payload?.title || meta.label;
}

function bodyFor(notification) {
  return notification.payload?.body || '';
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const items = useNotificationStore((state) => state.items);
  const unread = useNotificationStore((state) => state.unread);
  const loading = useNotificationStore((state) => state.loading);
  const loaded = useNotificationStore((state) => state.loaded);
  const error = useNotificationStore((state) => state.error);
  const fetchNotifications = useNotificationStore((state) => state.fetch);
  const markRead = useNotificationStore((state) => state.markRead);
  const markAllRead = useNotificationStore((state) => state.markAllRead);
  const removeNotification = useNotificationStore((state) => state.remove);
  const clearRead = useNotificationStore((state) => state.clearRead);

  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!loaded && !loading) fetchNotifications();
  }, [loaded, loading, fetchNotifications]);

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [items],
  );

  const unreadItems = useMemo(() => sorted.filter((item) => !item.readAt), [sorted]);
  const filtered = filter === 'unread' ? unreadItems : sorted;
  const readCount = sorted.length - unreadItems.length;

  const groups = useMemo(() => {
    const result = [];
    for (const notification of filtered) {
      const label = formatDayLabel(notification.createdAt);
      let group = result.find((entry) => entry.label === label);
      if (!group) {
        group = { label, items: [] };
        result.push(group);
      }
      group.items.push(notification);
    }
    return result;
  }, [filtered]);

  const open = (notification) => {
    if (!notification.readAt) {
      markRead(notification.id).catch(() => {
        toast.error('That notification could not be marked as read.');
      });
    }
    const destination = routeFor(notification);
    if (destination) navigate(destination);
  };

  const run = async (key, action, message) => {
    if (busy) return;
    setBusy(key);
    try {
      await action();
      if (message) toast.success(message);
    } catch (err) {
      toast.error(getErrorMessage(err, 'That action could not be completed.'));
    } finally {
      setBusy(null);
    }
  };

  const filters = [
    { id: 'all', label: 'All', icon: Inbox, count: sorted.length },
    { id: 'unread', label: 'Unread', icon: BellRing, count: unreadItems.length },
  ];

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Your activity"
        icon={Bell}
        title="Notifications"
        description="Requests, messages, and calls gathered in one calm place."
        actions={
          <>
            <Button
              variant="ghost"
              icon={RefreshCw}
              loading={loading && loaded}
              onClick={() => fetchNotifications()}
            >
              Refresh
            </Button>
            <Button
              icon={CheckCheck}
              disabled={!unread}
              loading={busy === 'all'}
              onClick={() => run('all', markAllRead, 'You are all caught up.')}
            >
              Mark all read
            </Button>
          </>
        }
      />

      <ScreenBody>
        <div className={styles.toolbar}>
          <Segmented options={filters} value={filter} onChange={setFilter} />
          <div className={styles.toolbarRight}>
            <span className={styles.summary}>
              {unread ? `${unread} unread` : 'All caught up'}
              {sorted.length ? ` · ${sorted.length} total` : ''}
            </span>
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              disabled={!readCount || Boolean(busy)}
              loading={busy === 'clear'}
              onClick={() => run('clear', clearRead, 'Read notifications cleared.')}
            >
              Clear read
            </Button>
          </div>
        </div>

        {loading && !items.length ? (
          <div className={styles.list} aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <Card key={index} className={styles.skeletonRow}>
                <Skeleton width={42} height={42} radius={999} />
                <span className={styles.skeletonText}>
                  <Skeleton width="32%" height={12} />
                  <Skeleton width="66%" height={10} />
                  <Skeleton width="22%" height={9} />
                </span>
              </Card>
            ))}
          </div>
        ) : error && !items.length ? (
          <Card>
            <EmptyState
              icon={BellOff}
              title="Notifications are unavailable"
              description={getErrorMessage(error, 'Check your connection and try again.')}
            >
              <Button icon={RefreshCw} onClick={() => fetchNotifications()}>
                Try again
              </Button>
            </EmptyState>
          </Card>
        ) : filtered.length ? (
          <div className={styles.groupStack}>
            {groups.map((group) => (
              <Section key={group.label} title={group.label} className={styles.groupSection}>
                <ul className={styles.list}>
                  {group.items.map((notification) => {
                    const meta = TYPE_META[notification.type] ?? FALLBACK;
                    const Icon = meta.icon;
                    const unreadItem = !notification.readAt;

                    return (
                      <li key={notification.id}>
                        <Card className={styles.row} data-unread={unreadItem}>
                          <button
                            type="button"
                            className={styles.rowMain}
                            onClick={() => open(notification)}
                          >
                            <span className={styles.avatarWrap}>
                              {notification.actor ? (
                                <Avatar user={notification.actor} size="md" />
                              ) : (
                                <span className={styles.systemAvatar} data-tone={meta.tone}>
                                  <Icon size={18} />
                                </span>
                              )}
                              {notification.actor ? (
                                <span className={styles.typeBadge} data-tone={meta.tone}>
                                  <Icon size={10} />
                                </span>
                              ) : null}
                            </span>

                            <span className={styles.rowText}>
                              <span className={styles.rowTop}>
                                <strong>{titleFor(notification, meta)}</strong>
                                <time dateTime={notification.createdAt}>
                                  {formatRelative(notification.createdAt)}
                                </time>
                              </span>
                              {bodyFor(notification) ? (
                                <span className={styles.body}>{bodyFor(notification)}</span>
                              ) : null}
                              <span className={styles.rowMeta}>
                                <span className={styles.typeLabel} data-tone={meta.tone}>
                                  {meta.label}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{formatTime(notification.createdAt)}</span>
                                {unreadItem ? (
                                  <span className={styles.unreadLabel}>
                                    <i /> Unread
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          </button>

                          <div className={styles.rowActions}>
                            <IconButton
                              label="Remove notification"
                              size="sm"
                              onClick={() =>
                                run(`remove:${notification.id}`, () =>
                                  removeNotification(notification.id),
                                )
                              }
                            >
                              <Trash2 size={15} />
                            </IconButton>
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            ))}
          </div>
        ) : filter === 'unread' ? (
          <Card>
            <EmptyState
              icon={BellRing}
              title="Nothing unread"
              description="You have seen everything that has come in. New activity will land here."
            >
              <Button variant="secondary" onClick={() => setFilter('all')}>
                View all activity
              </Button>
            </EmptyState>
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon={Inbox}
              title="No notifications yet"
              description="Connection requests, messages while you are away, and call updates will appear here."
            />
          </Card>
        )}
      </ScreenBody>
    </Screen>
  );
}

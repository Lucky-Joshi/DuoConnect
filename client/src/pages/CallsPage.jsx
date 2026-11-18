import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Headphones,
  History,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  RefreshCw,
  UserPlus,
  Video,
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
  Spinner,
} from '../components/ui/Primitives';
import { api, unwrap } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useCallStore } from '../stores/callStore';
import { useChatStore } from '../stores/chatStore';
import { usePresenceStore } from '../stores/presenceStore';
import { useUiStore } from '../stores/uiStore';
import {
  formatDayLabel,
  formatDuration,
  formatRelative,
  formatTime,
  getErrorMessage,
} from '../lib/utils';
import styles from './CallsPage.module.css';

const FILTERS = [
  { id: 'all', label: 'All', icon: History },
  { id: 'missed', label: 'Missed', icon: PhoneMissed },
  { id: 'audio', label: 'Audio', icon: Headphones },
  { id: 'video', label: 'Video', icon: Video },
];

const otherParty = (call, meId) => (call.caller.id === meId ? call.callee : call.caller);
const isOutgoing = (call, meId) => call.caller.id === meId;
const isMissedForMe = (call, meId) =>
  !isOutgoing(call, meId) && ['missed', 'cancelled'].includes(call.status);

function statusLabel(call, meId) {
  const outgoing = isOutgoing(call, meId);
  switch (call.status) {
    case 'completed':
      return outgoing ? 'Outgoing call' : 'Incoming call';
    case 'missed':
      return outgoing ? 'No answer' : 'Missed call';
    case 'declined':
      return outgoing ? 'Declined' : 'You declined';
    case 'cancelled':
      return outgoing ? 'Cancelled' : 'Missed call';
    case 'failed':
      return 'Call failed';
    case 'ringing':
    case 'ongoing':
      return 'In progress';
    default:
      return 'Call';
  }
}

function StatusIcon({ call, meId, size = 15 }) {
  if (['ringing', 'ongoing'].includes(call.status)) return <PhoneCall size={size} />;
  if (isMissedForMe(call, meId) || call.status === 'failed') return <PhoneMissed size={size} />;
  if (isOutgoing(call, meId)) return <PhoneOutgoing size={size} />;
  return <PhoneIncoming size={size} />;
}

function Metric({ icon: Icon, value, label, tone }) {
  return (
    <Card className={styles.metric}>
      <span className={styles.metricIcon} data-tone={tone}>
        <Icon size={17} />
      </span>
      <div className={styles.metricText}>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </Card>
  );
}

export default function CallsPage() {
  const navigate = useNavigate();
  const me = useAuthStore((state) => state.user);
  const presence = usePresenceStore((state) => state.byId);
  const createDirect = useChatStore((state) => state.createDirect);
  const startCall = useCallStore((state) => state.startCall);
  const setNewChatOpen = useUiStore((state) => state.setNewChatOpen);

  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const data = unwrap(await api.get('/calls', { params: { limit: 100 } }));
      setCalls(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const meId = me?.id;

  const counts = useMemo(() => {
    const missed = calls.filter((call) => isMissedForMe(call, meId)).length;
    const audio = calls.filter((call) => call.kind === 'audio').length;
    const video = calls.filter((call) => call.kind === 'video').length;
    return { all: calls.length, missed, audio, video };
  }, [calls, meId]);

  const talkTime = useMemo(
    () => calls.reduce((total, call) => total + (Number(call.durationSeconds) || 0), 0),
    [calls],
  );

  const filtered = useMemo(() => {
    if (filter === 'missed') return calls.filter((call) => isMissedForMe(call, meId));
    if (filter === 'audio' || filter === 'video') {
      return calls.filter((call) => call.kind === filter);
    }
    return calls;
  }, [calls, filter, meId]);

  const groups = useMemo(() => {
    const result = [];
    for (const call of filtered) {
      const label = formatDayLabel(call.createdAt);
      let group = result.find((item) => item.label === label);
      if (!group) {
        group = { label, calls: [] };
        result.push(group);
      }
      group.calls.push(call);
    }
    return result;
  }, [filtered]);

  const callBack = async (call, kind) => {
    if (busy || !meId) return;
    const other = otherParty(call, meId);
    if (!other?.id) return;
    setBusy(`${call.id}:${kind}`);
    try {
      const chat = await createDirect(other.id);
      await startCall(chat, kind);
    } catch (err) {
      toast.error(getErrorMessage(err, 'That call could not be started.'));
    } finally {
      setBusy(null);
    }
  };

  const filterOptions = FILTERS.map((option) => ({
    ...option,
    count: counts[option.id] ?? 0,
  }));

  const filterEmptyCopy = {
    missed: {
      title: 'No missed calls',
      description: 'Every call has been answered. That is a good streak to keep.',
    },
    audio: {
      title: 'No audio calls yet',
      description: 'Audio calls show up here once you have had one.',
    },
    video: {
      title: 'No video calls yet',
      description: 'Start a video call from a conversation or from this page.',
    },
  };

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Conversations"
        icon={PhoneCall}
        title="Calls"
        description="Everything you have shared out loud, with a quick way back to the people behind it."
        actions={
          <>
            <Button
              variant="ghost"
              icon={RefreshCw}
              loading={refreshing}
              onClick={() => load({ silent: true })}
            >
              Refresh
            </Button>
            <Button icon={Phone} onClick={() => setNewChatOpen(true)}>
              Start a call
            </Button>
          </>
        }
      />

      <ScreenBody>
        {loading ? (
          <>
            <div className={styles.metrics} aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <Card key={index} className={styles.metricSkeleton}>
                  <Skeleton width={38} height={38} radius={12} />
                  <span className={styles.metricSkeletonText}>
                    <Skeleton width="46%" height={16} />
                    <Skeleton width="68%" height={10} />
                  </span>
                </Card>
              ))}
            </div>
            <div className={styles.callList} aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <Card key={index} className={styles.callSkeleton}>
                  <Skeleton width={42} height={42} radius={999} />
                  <span className={styles.callSkeletonText}>
                    <Skeleton width="30%" height={12} />
                    <Skeleton width="52%" height={10} />
                  </span>
                  <Skeleton width={76} height={30} radius={10} />
                </Card>
              ))}
            </div>
          </>
        ) : error ? (
          <Card>
            <EmptyState
              icon={PhoneOff}
              title="Call history is unavailable"
              description={getErrorMessage(error, 'Check your connection and try again.')}
            >
              <Button icon={RefreshCw} onClick={() => load()}>
                Try again
              </Button>
            </EmptyState>
          </Card>
        ) : (
          <>
            <div className={styles.metrics}>
              <Metric
                icon={PhoneCall}
                value={counts.all}
                label="Calls in your history"
                tone="accent"
              />
              <Metric
                icon={Headphones}
                value={formatDuration(talkTime)}
                label="Time spent talking"
              />
              <Metric icon={PhoneMissed} value={counts.missed} label="Missed calls" tone="warn" />
              <Metric icon={Video} value={counts.video} label="Video calls" />
            </div>

            <div className={styles.toolbar}>
              <Segmented options={filterOptions} value={filter} onChange={setFilter} />
              <span className={styles.toolbarHint}>
                {filtered.length} {filtered.length === 1 ? 'call' : 'calls'}
                {filter !== 'all'
                  ? ` in ${FILTERS.find((item) => item.id === filter)?.label.toLowerCase()}`
                  : ''}
              </span>
            </div>

            {filtered.length ? (
              <div className={styles.groupStack}>
                {groups.map((group) => (
                  <Section key={group.label} title={group.label} className={styles.groupSection}>
                    <ul className={styles.callList}>
                      {group.calls.map((call) => {
                        const other = otherParty(call, meId);
                        const online = presence[other?.id]?.status ?? other?.status ?? 'offline';
                        const live = ['ringing', 'ongoing'].includes(call.status);
                        const missed = isMissedForMe(call, meId);

                        return (
                          <li key={call.id}>
                            <Card className={styles.callRow}>
                              <Avatar
                                user={other}
                                size="md"
                                showStatus
                                status={online}
                                onClick={
                                  other?.username
                                    ? () => navigate(`/app/u/${other.username}`)
                                    : undefined
                                }
                              />
                              <div className={styles.callText}>
                                <div className={styles.callTitle}>
                                  <strong>{other?.displayName ?? 'Unknown person'}</strong>
                                  <span className={styles.kindPill}>
                                    {call.kind === 'video' ? (
                                      <Video size={11} />
                                    ) : (
                                      <Headphones size={11} />
                                    )}
                                    {call.kind === 'video' ? 'Video' : 'Audio'}
                                  </span>
                                </div>
                                <span className={styles.callMeta}>
                                  <span
                                    className={styles.statusNote}
                                    data-tone={missed ? 'missed' : live ? 'live' : undefined}
                                  >
                                    <StatusIcon call={call} meId={meId} size={13} />
                                    {statusLabel(call, meId)}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <time dateTime={call.createdAt}>
                                    {formatRelative(call.createdAt)}
                                  </time>
                                </span>
                              </div>
                              <div className={styles.callStats}>
                                {call.durationSeconds ? (
                                  <span className={styles.duration}>
                                    {formatDuration(call.durationSeconds)}
                                  </span>
                                ) : null}
                                <time>{formatTime(call.createdAt)}</time>
                              </div>
                              <div className={styles.callActions}>
                                {live ? (
                                  <span className={styles.livePill}>
                                    <i /> Live
                                  </span>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      icon={call.kind === 'video' ? Video : Phone}
                                      loading={busy === `${call.id}:${call.kind}`}
                                      onClick={() => callBack(call, call.kind)}
                                    >
                                      Call back
                                    </Button>
                                    <IconButton
                                      label={`Start ${call.kind === 'video' ? 'audio' : 'video'} call`}
                                      size="sm"
                                      tone="accent"
                                      disabled={Boolean(busy)}
                                      onClick={() =>
                                        callBack(call, call.kind === 'video' ? 'audio' : 'video')
                                      }
                                    >
                                      {busy ===
                                      `${call.id}:${call.kind === 'video' ? 'audio' : 'video'}` ? (
                                        <Spinner size={14} />
                                      ) : call.kind === 'video' ? (
                                        <Phone size={15} />
                                      ) : (
                                        <Video size={15} />
                                      )}
                                    </IconButton>
                                  </>
                                )}
                              </div>
                            </Card>
                          </li>
                        );
                      })}
                    </ul>
                  </Section>
                ))}
              </div>
            ) : filter !== 'all' ? (
              <Card>
                <EmptyState
                  compact
                  icon={FILTERS.find((item) => item.id === filter)?.icon ?? PhoneOff}
                  title={filterEmptyCopy[filter].title}
                  description={filterEmptyCopy[filter].description}
                >
                  <Button variant="secondary" onClick={() => setFilter('all')}>
                    Show all calls
                  </Button>
                </EmptyState>
              </Card>
            ) : (
              <Card>
                <EmptyState
                  icon={PhoneCall}
                  title="Your call history starts here"
                  description="Open a conversation to call someone, or find a person to connect with first."
                >
                  <div className={styles.emptyActions}>
                    <Button icon={Phone} onClick={() => setNewChatOpen(true)}>
                      Start a call
                    </Button>
                    <Button
                      variant="ghost"
                      icon={UserPlus}
                      onClick={() => navigate('/app/friends')}
                    >
                      Find people
                    </Button>
                  </div>
                </EmptyState>
              </Card>
            )}
          </>
        )}
      </ScreenBody>
    </Screen>
  );
}

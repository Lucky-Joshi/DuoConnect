import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Ban,
  Check,
  Clock3,
  MessageCircle,
  Search,
  ShieldOff,
  UserPlus,
  UserRound,
  UserRoundMinus,
  Users,
  X,
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
import { Modal } from '../components/ui/Modal';
import { useFriendsStore } from '../stores/friendsStore';
import { useChatStore } from '../stores/chatStore';
import { usePresenceStore } from '../stores/presenceStore';
import { useUiStore } from '../stores/uiStore';
import { cn, formatRelative, getErrorMessage, presenceLabel } from '../lib/utils';
import styles from './FriendsPage.module.css';

const TABS = ['connections', 'requests', 'blocked'];

const CONFIRM_COPY = {
  remove: {
    title: 'Remove connection',
    body: (name) =>
      `${name} will no longer be in your connections. Your conversation history stays, but messaging pauses until you reconnect.`,
    confirm: 'Remove',
    tone: 'danger',
  },
  block: {
    title: 'Block person',
    body: (name) =>
      `${name} will not be able to message, call, or send you requests. You can unblock them anytime from this page.`,
    confirm: 'Block',
    tone: 'danger',
  },
  cancel: {
    title: 'Cancel request',
    body: (name) => `Your connection request to ${name} will be withdrawn.`,
    confirm: 'Cancel request',
    tone: 'secondary',
  },
  decline: {
    title: 'Decline request',
    body: (name) =>
      `${name} will not be notified. You can still connect later if they send another request.`,
    confirm: 'Decline',
    tone: 'secondary',
  },
};

function ActionResult({ busy, onAccept, onDecline, onCancel, request }) {
  if (request?.direction === 'incoming') {
    return (
      <div className={styles.rowActions}>
        <Button size="sm" icon={Check} loading={busy} onClick={onAccept}>
          Accept
        </Button>
        <Button size="sm" variant="ghost" onClick={onDecline} disabled={busy}>
          Decline
        </Button>
      </div>
    );
  }
  return (
    <div className={styles.rowActions}>
      <span className={styles.pendingPill}>
        <Clock3 size={12} /> Pending
      </span>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
    </div>
  );
}

export default function FriendsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchRef = useRef(null);

  const friends = useFriendsStore((state) => state.friends);
  const incoming = useFriendsStore((state) => state.incoming);
  const outgoing = useFriendsStore((state) => state.outgoing);
  const blocked = useFriendsStore((state) => state.blocked);
  const searchResults = useFriendsStore((state) => state.searchResults);
  const searching = useFriendsStore((state) => state.searching);
  const loading = useFriendsStore((state) => state.loading);
  const searchUsers = useFriendsStore((state) => state.searchUsers);
  const clearSearch = useFriendsStore((state) => state.clearSearch);
  const sendRequest = useFriendsStore((state) => state.sendRequest);
  const accept = useFriendsStore((state) => state.accept);
  const decline = useFriendsStore((state) => state.decline);
  const cancel = useFriendsStore((state) => state.cancel);
  const remove = useFriendsStore((state) => state.remove);
  const block = useFriendsStore((state) => state.block);
  const unblock = useFriendsStore((state) => state.unblock);
  const createDirect = useChatStore((state) => state.createDirect);
  const setNewChatOpen = useUiStore((state) => state.setNewChatOpen);
  const presence = usePresenceStore((state) => state.byId);

  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const tabParam = searchParams.get('tab');
  const tab = TABS.includes(tabParam) ? tabParam : 'connections';
  const term = query.trim();
  const searchingNow = term.length >= 2;

  useEffect(() => {
    if (searchingNow) return undefined;
    clearSearch();
    return undefined;
  }, [searchingNow, clearSearch]);

  useEffect(() => {
    if (!searchingNow) return undefined;
    const timer = setTimeout(() => {
      searchUsers(term).catch((error) => {
        toast.error(getErrorMessage(error, 'That search could not be completed.'));
      });
    }, 280);
    return () => clearTimeout(timer);
  }, [term, searchingNow, searchUsers]);

  const changeTab = (next) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
    if (query) setQuery('');
  };

  const openProfile = (user) => navigate(`/app/u/${user.username}`);

  const openChat = async (user) => {
    if (busy) return;
    setBusy(`chat:${user.id}`);
    try {
      const chat = await createDirect(user.id);
      navigate(`/app/c/${chat.id}`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'That conversation could not be opened.'));
    } finally {
      setBusy(null);
    }
  };

  const requestConnection = async (user) => {
    if (busy) return;
    setBusy(`add:${user.id}`);
    try {
      const data = await sendRequest(user.id);
      if (data?.accepted) {
        toast.success(`You and ${user.displayName} are now connected.`);
      } else {
        toast.success(`Request sent to ${user.displayName}.`);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'That request could not be sent.'));
    } finally {
      setBusy(null);
    }
  };

  const respond = async (key, action, label) => {
    if (busy) return;
    setBusy(key);
    try {
      await action();
      if (label) toast.success(label);
    } catch (error) {
      toast.error(getErrorMessage(error, 'That action could not be completed.'));
    } finally {
      setBusy(null);
    }
  };

  const acceptRequest = async (request) => {
    if (busy) return;
    setBusy(`accept:${request.id}`);
    try {
      const data = await accept(request.id);
      toast.success(`You and ${request.user.displayName} are now connected.`);
      if (data?.chatId) {
        toast('A private conversation is ready in Chats.', { icon: '💬' });
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'That request could not be accepted.'));
    } finally {
      setBusy(null);
    }
  };

  const confirmAction = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    const name = confirm.user.displayName;
    try {
      if (confirm.kind === 'remove') {
        await remove(confirm.user.id);
        toast.success(`${name} removed from your connections.`);
      } else if (confirm.kind === 'block') {
        await block(confirm.user.id);
        toast.success(`${name} has been blocked.`);
      } else if (confirm.kind === 'cancel') {
        await cancel(confirm.requestId);
        toast.success('Request cancelled.');
      } else if (confirm.kind === 'decline') {
        await decline(confirm.requestId);
        toast.success('Request declined.');
      }
      setConfirm(null);
    } catch (error) {
      toast.error(getErrorMessage(error, 'That action could not be completed.'));
    } finally {
      setConfirmBusy(false);
    }
  };

  const focusSearch = () => {
    searchRef.current?.focus();
    searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const tabOptions = [
    { id: 'connections', label: 'Connections', icon: Users, count: friends.length },
    {
      id: 'requests',
      label: 'Requests',
      icon: UserPlus,
      count: incoming.length + outgoing.length,
    },
    { id: 'blocked', label: 'Blocked', icon: Ban, count: blocked.length },
  ];

  const activeStatus = (user) => presence[user.id]?.status ?? user.status ?? 'offline';

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Your circle"
        icon={Users}
        title="People"
        description="Find the people you want close, respond to requests, and keep your circle intentional."
        actions={
          <>
            <Button variant="ghost" icon={Search} onClick={focusSearch}>
              Find people
            </Button>
            <Button icon={MessageCircle} onClick={() => setNewChatOpen(true)}>
              New chat
            </Button>
          </>
        }
      />

      <ScreenBody>
        <div className={styles.searchBar}>
          <Search size={17} className={styles.searchIcon} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or @username"
            aria-label="Search people"
          />
          {query ? (
            <button
              type="button"
              className={styles.clearSearch}
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          ) : (
            <span className={styles.searchHint}>Everyone on DuoConnect</span>
          )}
        </div>

        {searchingNow ? (
          <Section
            title={`Results for “${term}”`}
            description="Search the whole network, then send a request or open a profile."
            actions={searching ? <Spinner size={16} /> : null}
          >
            {searching && !searchResults.length ? (
              <div className={styles.skeletonList} aria-hidden="true">
                {[0, 1, 2].map((row) => (
                  <div key={row} className={styles.skeletonRow}>
                    <Skeleton width={42} height={42} radius={999} />
                    <span className={styles.skeletonText}>
                      <Skeleton width="36%" height={12} />
                      <Skeleton width="24%" height={10} />
                    </span>
                  </div>
                ))}
              </div>
            ) : searchResults.length ? (
              <ul className={styles.resultList}>
                {searchResults.map(({ user, relation }) => {
                  const request = relation?.request;
                  const rowBusy =
                    busy === `add:${user.id}` ||
                    busy === `accept:${request?.id}` ||
                    busy === `decline:${request?.id}` ||
                    busy === `cancel:${request?.id}` ||
                    busy === `chat:${user.id}`;

                  return (
                    <li key={user.id} className={styles.resultRow}>
                      <Avatar
                        user={user}
                        size="md"
                        showStatus
                        status={activeStatus(user)}
                        onClick={() => openProfile(user)}
                      />
                      <div className={styles.resultText}>
                        <strong>{user.displayName}</strong>
                        <span>
                          @{user.username}
                          {user.about ? ` · ${user.about}` : ''}
                        </span>
                      </div>
                      <div className={styles.rowActions}>
                        {relation?.isFriend ? (
                          <Button
                            size="sm"
                            icon={MessageCircle}
                            loading={busy === `chat:${user.id}`}
                            onClick={() => openChat(user)}
                          >
                            Message
                          </Button>
                        ) : request?.direction === 'incoming' ? (
                          <>
                            <Button
                              size="sm"
                              icon={Check}
                              loading={busy === `accept:${request.id}`}
                              onClick={() =>
                                respond(
                                  `accept:${request.id}`,
                                  () => accept(request.id),
                                  'You are now connected.',
                                )
                              }
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={rowBusy}
                              onClick={() =>
                                respond(
                                  `decline:${request.id}`,
                                  () => decline(request.id),
                                  'Request declined.',
                                )
                              }
                            >
                              Decline
                            </Button>
                          </>
                        ) : request?.direction === 'outgoing' ? (
                          <>
                            <span className={styles.pendingPill}>
                              <Clock3 size={12} /> Pending
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={rowBusy}
                              onClick={() =>
                                respond(
                                  `cancel:${request.id}`,
                                  () => cancel(request.id),
                                  'Request cancelled.',
                                )
                              }
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            icon={UserPlus}
                            loading={busy === `add:${user.id}`}
                            onClick={() => requestConnection(user)}
                          >
                            Connect
                          </Button>
                        )}
                        <IconButton
                          label="View profile"
                          size="sm"
                          onClick={() => openProfile(user)}
                        >
                          <UserRound size={16} />
                        </IconButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={Search}
                title="No one matched that search"
                description="Try a different name, username, or check the spelling."
              />
            )}
          </Section>
        ) : (
          <>
            <div className={styles.toolbar}>
              <Segmented options={tabOptions} value={tab} onChange={changeTab} />
              <span className={styles.summary}>
                {friends.length} {friends.length === 1 ? 'connection' : 'connections'}
                {incoming.length ? ` · ${incoming.length} waiting on you` : ''}
              </span>
            </div>

            {tab === 'connections' ? (
              <Section title="Connections" description="The people who can message and call you.">
                {loading && !friends.length ? (
                  <div className={styles.cardGrid} aria-hidden="true">
                    {[0, 1, 2, 3].map((row) => (
                      <Card key={row} className={styles.skeletonCard}>
                        <Skeleton width={48} height={48} radius={999} />
                        <Skeleton width="52%" height={12} />
                        <Skeleton width="78%" height={10} />
                        <Skeleton width="40%" height={10} />
                      </Card>
                    ))}
                  </div>
                ) : friends.length ? (
                  <div className={styles.cardGrid}>
                    {friends.map((entry) => {
                      const { user } = entry;
                      const status = activeStatus(user);
                      return (
                        <Card key={user.id} className={styles.personCard}>
                          <div className={styles.personHead}>
                            <Avatar
                              user={user}
                              size="lg"
                              showStatus
                              status={status}
                              onClick={() => openProfile(user)}
                            />
                            <div className={styles.personIdentity}>
                              <button type="button" onClick={() => openProfile(user)}>
                                {user.displayName}
                              </button>
                              <span>@{user.username}</span>
                              <em>{presenceLabel(status, presence[user.id]?.lastSeenAt)}</em>
                            </div>
                          </div>
                          <p className={styles.bio}>
                            {user.about ||
                              'You have kept this one close. Say hello and pick up where you left off.'}
                          </p>
                          <div className={styles.personFoot}>
                            <span className={styles.connected}>
                              <Clock3 size={12} /> Connected {formatRelative(entry.friendsSince)}
                            </span>
                            <div className={styles.personActions}>
                              <Button
                                size="sm"
                                icon={MessageCircle}
                                loading={busy === `chat:${user.id}`}
                                onClick={() => openChat(user)}
                              >
                                Message
                              </Button>
                              <IconButton
                                label={`Remove ${user.displayName}`}
                                size="sm"
                                tone="danger"
                                onClick={() => setConfirm({ kind: 'remove', user })}
                              >
                                <UserRoundMinus size={16} />
                              </IconButton>
                              <IconButton
                                label={`Block ${user.displayName}`}
                                size="sm"
                                tone="danger"
                                onClick={() => setConfirm({ kind: 'block', user })}
                              >
                                <ShieldOff size={16} />
                              </IconButton>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={Users}
                    title="Your circle starts here"
                    description="Search for someone you know, or share your profile and let them find you."
                  >
                    <Button icon={UserPlus} onClick={focusSearch}>
                      Find your first connection
                    </Button>
                  </EmptyState>
                )}
              </Section>
            ) : null}

            {tab === 'requests' ? (
              <>
                <Section
                  title="Waiting on you"
                  description="Requests from people who would like to connect."
                >
                  {incoming.length ? (
                    <ul className={styles.requestList}>
                      {incoming.map((request) => (
                        <li key={request.id}>
                          <Card className={styles.requestCard}>
                            <Avatar
                              user={request.user}
                              size="md"
                              showStatus
                              status={activeStatus(request.user)}
                              onClick={() => openProfile(request.user)}
                            />
                            <div className={styles.requestText}>
                              <strong>{request.user.displayName}</strong>
                              <span className={styles.requestHandle}>@{request.user.username}</span>
                              {request.message ? (
                                <blockquote>“{request.message}”</blockquote>
                              ) : (
                                <p>{request.user.about || 'Would like to connect with you.'}</p>
                              )}
                              <time>{formatRelative(request.createdAt)}</time>
                            </div>
                            <ActionResult
                              request={request}
                              busy={busy === `accept:${request.id}`}
                              onAccept={() => acceptRequest(request)}
                              onDecline={() =>
                                setConfirm({
                                  kind: 'decline',
                                  user: request.user,
                                  requestId: request.id,
                                })
                              }
                            />
                          </Card>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      compact
                      icon={Check}
                      title="No requests waiting"
                      description="When someone asks to connect, they will show up here."
                    />
                  )}
                </Section>

                <Section
                  title="Sent requests"
                  description="Requests you have sent that have not been answered yet."
                >
                  {outgoing.length ? (
                    <ul className={styles.requestList}>
                      {outgoing.map((request) => (
                        <li key={request.id}>
                          <Card className={cn(styles.requestCard, styles.outgoingCard)}>
                            <Avatar
                              user={request.user}
                              size="md"
                              showStatus
                              status={activeStatus(request.user)}
                              onClick={() => openProfile(request.user)}
                            />
                            <div className={styles.requestText}>
                              <strong>{request.user.displayName}</strong>
                              <span className={styles.requestHandle}>@{request.user.username}</span>
                              <p>
                                {request.message
                                  ? `“${request.message}”`
                                  : 'Waiting for a response.'}
                              </p>
                              <time>Sent {formatRelative(request.createdAt)}</time>
                            </div>
                            <ActionResult
                              request={request}
                              busy={busy === `cancel:${request.id}`}
                              onCancel={() =>
                                setConfirm({
                                  kind: 'cancel',
                                  user: request.user,
                                  requestId: request.id,
                                })
                              }
                            />
                          </Card>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      compact
                      icon={Clock3}
                      title="Nothing sent right now"
                      description="Requests you send will wait here until they are answered."
                    />
                  )}
                </Section>
              </>
            ) : null}

            {tab === 'blocked' ? (
              <Section
                title="Blocked"
                description="Blocked people cannot message, call, or send you requests."
              >
                {blocked.length ? (
                  <ul className={styles.blockedList}>
                    {blocked.map((entry) => (
                      <li key={entry.user.id}>
                        <Card className={styles.blockedRow}>
                          <Avatar user={entry.user} size="md" />
                          <div className={styles.resultText}>
                            <strong>{entry.user.displayName}</strong>
                            <span>
                              @{entry.user.username} · Blocked {formatRelative(entry.blockedAt)}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={busy === `unblock:${entry.user.id}`}
                            onClick={() =>
                              respond(
                                `unblock:${entry.user.id}`,
                                () => unblock(entry.user.id),
                                `${entry.user.displayName} is unblocked.`,
                              )
                            }
                          >
                            Unblock
                          </Button>
                        </Card>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    icon={Ban}
                    title="No one is blocked"
                    description="If you ever need space from someone, you can block them from their profile or connection card."
                  />
                )}
              </Section>
            ) : null}
          </>
        )}
      </ScreenBody>

      <Modal
        open={Boolean(confirm)}
        onClose={() => (confirmBusy ? null : setConfirm(null))}
        title={confirm ? CONFIRM_COPY[confirm.kind].title : ''}
        description={confirm ? CONFIRM_COPY[confirm.kind].body(confirm.user.displayName) : ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={confirmBusy}>
              Keep as is
            </Button>
            <Button
              variant={
                confirm?.kind === 'remove' || confirm?.kind === 'block' ? 'danger' : 'primary'
              }
              loading={confirmBusy}
              onClick={confirmAction}
            >
              {confirm ? CONFIRM_COPY[confirm.kind].confirm : 'Confirm'}
            </Button>
          </>
        }
      >
        {confirm ? (
          <div className={styles.confirmPerson}>
            <Avatar user={confirm.user} size="md" />
            <span>
              <strong>{confirm.user.displayName}</strong>
              <span>@{confirm.user.username}</span>
            </span>
          </div>
        ) : null}
      </Modal>
    </Screen>
  );
}

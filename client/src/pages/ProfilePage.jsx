import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  Link2,
  MessageCircle,
  Pencil,
  Phone,
  ShieldCheck,
  ShieldOff,
  UserPlus,
  UserRound,
  UserRoundMinus,
  UserRoundX,
  Video,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Screen, ScreenHeader, ScreenBody, Section, Card } from '../components/layout/Screen';
import { Avatar, Button, EmptyState, IconButton, Skeleton } from '../components/ui/Primitives';
import { Modal } from '../components/ui/Modal';
import { api, unwrap } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useCallStore } from '../stores/callStore';
import { useChatStore } from '../stores/chatStore';
import { useFriendsStore } from '../stores/friendsStore';
import { usePresenceStore } from '../stores/presenceStore';
import { cn, formatRelative, getErrorMessage, messagePreview, presenceLabel } from '../lib/utils';
import styles from './ProfilePage.module.css';

const CONFIRM_COPY = {
  remove: {
    title: 'Remove connection',
    body: (name) =>
      `${name} will no longer be in your connections. Your conversation history stays, but messaging pauses until you reconnect.`,
    confirm: 'Remove',
  },
  block: {
    title: 'Block person',
    body: (name) =>
      `${name} will not be able to message, call, or send you requests. You can unblock them from this profile later.`,
    confirm: 'Block',
  },
};

export default function ProfilePage() {
  const { username } = useParams();
  const navigate = useNavigate();
  const me = useAuthStore((state) => state.user);
  const presence = usePresenceStore((state) => state.byId);
  const chats = useChatStore((state) => state.chats);
  const createDirect = useChatStore((state) => state.createDirect);
  const startCall = useCallStore((state) => state.startCall);
  const sendRequest = useFriendsStore((state) => state.sendRequest);
  const accept = useFriendsStore((state) => state.accept);
  const decline = useFriendsStore((state) => state.decline);
  const cancel = useFriendsStore((state) => state.cancel);
  const remove = useFriendsStore((state) => state.remove);
  const block = useFriendsStore((state) => state.block);
  const unblock = useFriendsStore((state) => state.unblock);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = unwrap(await api.get(`/users/${encodeURIComponent(username)}`));
      setProfile(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProfile(null);

    api
      .get(`/users/${encodeURIComponent(username)}`)
      .then(unwrap)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [username]);

  const user = profile?.user ?? null;
  const relation = profile?.relation ?? null;
  const status = user ? (presence[user.id]?.status ?? user.status ?? 'offline') : 'offline';
  const lastSeenAt = user ? (presence[user.id]?.lastSeenAt ?? user.lastSeenAt) : null;
  const sharedChat = user ? chats.find((chat) => chat.otherUser?.id === user.id) : null;

  const run = async (key, action, successMessage) => {
    if (busy) return;
    setBusy(key);
    try {
      await action();
      if (successMessage) toast.success(successMessage);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'That action could not be completed.'));
    } finally {
      setBusy(null);
    }
  };

  const openChat = async () => {
    if (!user || busy) return;
    setBusy('chat');
    try {
      const chat = await createDirect(user.id);
      navigate(`/app/c/${chat.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'That conversation could not be opened.'));
    } finally {
      setBusy(null);
    }
  };

  const call = async (kind) => {
    if (!user || busy) return;
    setBusy(`call:${kind}`);
    try {
      const chat = await createDirect(user.id);
      await startCall(chat, kind);
    } catch (err) {
      toast.error(getErrorMessage(err, 'That call could not be started.'));
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    if (!user) return;
    const url = `${window.location.origin}/app/u/${user.username}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Profile link copied.');
    } catch {
      toast.error('The link could not be copied from this browser.');
    }
  };

  const submitNote = async (event) => {
    event.preventDefault();
    if (!user || busy) return;
    setBusy('connect');
    try {
      const data = await sendRequest(user.id, note.trim() || undefined);
      if (data?.accepted) {
        toast.success(`You and ${user.displayName} are now connected.`);
      } else {
        toast.success(`Request sent to ${user.displayName}.`);
      }
      setNoteOpen(false);
      setNote('');
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'That request could not be sent.'));
    } finally {
      setBusy(null);
    }
  };

  const confirmAction = async () => {
    if (!confirm || !user) return;
    setConfirmBusy(true);
    try {
      if (confirm.kind === 'remove') {
        await remove(user.id);
        toast.success(`${user.displayName} removed from your connections.`);
      } else {
        await block(user.id);
        toast.success(`${user.displayName} has been blocked.`);
      }
      setConfirm(null);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'That action could not be completed.'));
    } finally {
      setConfirmBusy(false);
    }
  };

  const renderActions = () => {
    if (!user || !relation) return null;

    if (relation.isSelf) {
      return (
        <>
          <Button icon={Pencil} onClick={() => navigate('/app/settings#profile')}>
            Edit profile
          </Button>
          <Button variant="secondary" icon={Link2} onClick={copyLink}>
            Copy link
          </Button>
        </>
      );
    }

    if (relation.blockedByMe) {
      return (
        <>
          <div className={styles.notice}>
            <ShieldOff size={16} />
            <span>You have blocked {user.displayName}.</span>
          </div>
          <Button
            variant="secondary"
            icon={ShieldCheck}
            loading={busy === 'unblock'}
            onClick={() =>
              run('unblock', () => unblock(user.id), `${user.displayName} is unblocked.`)
            }
          >
            Unblock
          </Button>
        </>
      );
    }

    if (relation.blockedMe) {
      return (
        <div className={styles.notice}>
          <ShieldOff size={16} />
          <span>This person is not available for messages or calls right now.</span>
        </div>
      );
    }

    if (relation.isFriend) {
      return (
        <>
          <Button icon={MessageCircle} loading={busy === 'chat'} onClick={openChat}>
            Message
          </Button>
          <Button
            variant="secondary"
            icon={Phone}
            loading={busy === 'call:audio'}
            onClick={() => call('audio')}
          >
            Audio call
          </Button>
          <Button
            variant="secondary"
            icon={Video}
            loading={busy === 'call:video'}
            onClick={() => call('video')}
          >
            Video call
          </Button>
          <span className={styles.actionSpacer} />
          <IconButton
            label={`Remove ${user.displayName}`}
            tone="danger"
            onClick={() => setConfirm({ kind: 'remove' })}
          >
            <UserRoundMinus size={17} />
          </IconButton>
          <IconButton
            label={`Block ${user.displayName}`}
            tone="danger"
            onClick={() => setConfirm({ kind: 'block' })}
          >
            <ShieldOff size={17} />
          </IconButton>
        </>
      );
    }

    if (relation.request?.direction === 'incoming') {
      return (
        <>
          <Button
            icon={Check}
            loading={busy === 'accept'}
            onClick={() =>
              run(
                'accept',
                () => accept(relation.request.id),
                `You and ${user.displayName} are now connected.`,
              )
            }
          >
            Accept request
          </Button>
          <Button
            variant="ghost"
            disabled={Boolean(busy)}
            onClick={() => run('decline', () => decline(relation.request.id), 'Request declined.')}
          >
            Decline
          </Button>
        </>
      );
    }

    if (relation.request?.direction === 'outgoing') {
      return (
        <>
          <span className={styles.pendingPill}>
            <Clock3 size={13} /> Request pending
          </span>
          <Button
            variant="ghost"
            loading={busy === 'cancel'}
            onClick={() =>
              run('cancel', () => cancel(relation.request.id), 'Connection request cancelled.')
            }
          >
            Cancel request
          </Button>
        </>
      );
    }

    return (
      <>
        <Button icon={UserPlus} onClick={() => setNoteOpen(true)}>
          Connect
        </Button>
        <Button variant="ghost" icon={Link2} onClick={copyLink}>
          Copy link
        </Button>
      </>
    );
  };

  if (error && !user) {
    const missing = error?.response?.status === 404;
    return (
      <Screen>
        <ScreenHeader
          eyebrow="People"
          icon={UserRound}
          title="Profile"
          actions={
            <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/app/friends')}>
              Back to people
            </Button>
          }
        />
        <ScreenBody>
          <Card>
            <EmptyState
              icon={missing ? UserRoundX : UserRound}
              title={missing ? 'That profile is not here' : 'We could not load this profile'}
              description={
                missing
                  ? 'The link may be old, or the account may no longer be available.'
                  : getErrorMessage(error, 'Check your connection and try again.')
              }
            >
              <div className={styles.emptyActions}>
                <Button onClick={() => navigate('/app/friends')}>Find people</Button>
                <Button variant="ghost" onClick={load}>
                  Try again
                </Button>
              </div>
            </EmptyState>
          </Card>
        </ScreenBody>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow="People"
        icon={UserRound}
        title="Profile"
        description="A closer look at someone in your circle, and a few ways to reach them."
        actions={
          <>
            <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/app/friends')}>
              People
            </Button>
            {user ? (
              <Button variant="secondary" icon={Link2} onClick={copyLink}>
                Share
              </Button>
            ) : null}
          </>
        }
      />

      <ScreenBody>
        {loading || !user ? (
          <>
            <Card className={styles.heroSkeleton} aria-hidden="true">
              <Skeleton width={112} height={112} radius={999} />
              <div className={styles.skeletonBody}>
                <Skeleton width="34%" height={20} />
                <Skeleton width="24%" height={12} />
                <Skeleton width="72%" height={12} />
                <Skeleton width="56%" height={12} />
              </div>
            </Card>
            <div className={styles.contextGrid} aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <Card key={index} className={styles.contextSkeleton}>
                  <Skeleton width={38} height={38} radius={12} />
                  <Skeleton width="58%" height={11} />
                  <Skeleton width="76%" height={10} />
                </Card>
              ))}
            </div>
          </>
        ) : (
          <>
            <Card className={styles.hero}>
              <span className={styles.heroGlow} aria-hidden="true" />
              <div className={styles.heroTop}>
                <Avatar user={user} size="xxl" showStatus status={status} ring />
                <div className={styles.identity}>
                  <div className={styles.nameRow}>
                    <h2>{user.displayName}</h2>
                    {relation.isSelf ? <span className={styles.youPill}>You</span> : null}
                    {relation.isFriend ? (
                      <span className={styles.friendPill}>
                        <Check size={11} /> Connected
                      </span>
                    ) : null}
                  </div>
                  <span className={styles.handle}>@{user.username}</span>
                  <span
                    className={cn(styles.presence, status === 'online' && styles.presenceOnline)}
                  >
                    <i />
                    {presenceLabel(status, lastSeenAt)}
                  </span>
                  <p className={cn(styles.about, !user.about && styles.aboutMuted)}>
                    {user.about || 'No bio yet.'}
                  </p>
                </div>
              </div>

              <div className={styles.heroActions}>{renderActions()}</div>

              <div className={styles.metaRow}>
                {user.createdAt ? (
                  <span>
                    <CalendarDays size={13} /> Joined{' '}
                    {format(new Date(user.createdAt), 'MMMM yyyy')}
                  </span>
                ) : null}
                {relation.friendsSince ? (
                  <span>
                    <Clock3 size={13} /> Connected {formatRelative(relation.friendsSince)}
                  </span>
                ) : null}
                {me && relation.isSelf ? (
                  <span>
                    <UserRound size={13} /> This is how others see you
                  </span>
                ) : null}
              </div>
            </Card>

            <Section
              title="Shared context"
              description="The little history you already have together."
            >
              <div className={styles.contextGrid}>
                <Card className={styles.contextCard}>
                  <span className={styles.contextIcon}>
                    <MessageCircle size={18} />
                  </span>
                  <div className={styles.contextText}>
                    <strong>Conversation</strong>
                    {sharedChat ? (
                      <p>
                        {sharedChat.lastMessage
                          ? messagePreview({
                              type: sharedChat.lastMessage.type,
                              body: sharedChat.lastMessage.preview,
                              deletedAt: sharedChat.lastMessage.deleted ? new Date() : null,
                            })
                          : 'Your thread is ready whenever you are.'}
                      </p>
                    ) : (
                      <p>
                        {relation.isFriend
                          ? 'Say hello — your first thread is one message away.'
                          : 'A conversation opens once you are connected.'}
                      </p>
                    )}
                  </div>
                  {sharedChat ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => navigate(`/app/c/${sharedChat.id}`)}
                    >
                      Open
                    </Button>
                  ) : null}
                </Card>

                <Card className={styles.contextCard}>
                  <span className={styles.contextIcon}>
                    <CalendarDays size={18} />
                  </span>
                  <div className={styles.contextText}>
                    <strong>On DuoConnect</strong>
                    <p>
                      {user.createdAt
                        ? `Joined ${formatRelative(user.createdAt)}.`
                        : 'New to the network.'}
                    </p>
                  </div>
                </Card>

                <Card className={styles.contextCard}>
                  <span className={styles.contextIcon}>
                    <Clock3 size={18} />
                  </span>
                  <div className={styles.contextText}>
                    <strong>Your status</strong>
                    <p>
                      {relation.isSelf
                        ? 'You are viewing your own public profile.'
                        : relation.isFriend
                          ? `Connected ${formatRelative(relation.friendsSince)}.`
                          : relation.request
                            ? 'A connection request is in progress.'
                            : 'Not connected yet.'}
                    </p>
                  </div>
                </Card>
              </div>
            </Section>
          </>
        )}
      </ScreenBody>

      <Modal
        open={noteOpen}
        onClose={() => (busy === 'connect' ? null : setNoteOpen(false))}
        title={`Connect with ${user?.displayName ?? 'someone'}`}
        description="Add a short note so they know why you are reaching out. It is optional."
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setNoteOpen(false)}
              disabled={busy === 'connect'}
            >
              Not now
            </Button>
            <Button icon={UserPlus} loading={busy === 'connect'} onClick={submitNote}>
              Send request
            </Button>
          </>
        }
      >
        <form className={styles.noteForm} onSubmit={submitNote}>
          {user ? (
            <div className={styles.notePerson}>
              <Avatar user={user} size="md" />
              <span>
                <strong>{user.displayName}</strong>
                <span>@{user.username}</span>
              </span>
            </div>
          ) : null}
          <label className={styles.noteLabel} htmlFor="connection-note">
            Your note
            <span>{note.length}/200</span>
          </label>
          <textarea
            id="connection-note"
            className={styles.noteInput}
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 200))}
            rows={4}
            placeholder="We met at the design meetup — would love to keep in touch."
            maxLength={200}
          />
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </Modal>

      <Modal
        open={Boolean(confirm)}
        onClose={() => (confirmBusy ? null : setConfirm(null))}
        title={confirm ? CONFIRM_COPY[confirm.kind].title : ''}
        description={confirm && user ? CONFIRM_COPY[confirm.kind].body(user.displayName) : ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={confirmBusy}>
              Keep as is
            </Button>
            <Button variant="danger" loading={confirmBusy} onClick={confirmAction}>
              {confirm ? CONFIRM_COPY[confirm.kind].confirm : 'Confirm'}
            </Button>
          </>
        }
      >
        {user ? (
          <div className={styles.confirmPerson}>
            <Avatar user={user} size="md" />
            <span>
              <strong>{user.displayName}</strong>
              <span>@{user.username}</span>
            </span>
          </div>
        ) : null}
      </Modal>
    </Screen>
  );
}

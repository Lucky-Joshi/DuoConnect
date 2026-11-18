import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCirclePlus, Search, UserPlus, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { Avatar, EmptyState, Skeleton, Spinner } from '../ui/Primitives';
import { useChatStore } from '../../stores/chatStore';
import { useFriendsStore } from '../../stores/friendsStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useUiStore } from '../../stores/uiStore';
import { getErrorMessage } from '../../lib/utils';
import styles from './NewChatModal.module.css';

export function NewChatModal({ onOpenChat }) {
  const navigate = useNavigate();
  const open = useUiStore((state) => state.newChatOpen);
  const setOpen = useUiStore((state) => state.setNewChatOpen);
  const friends = useFriendsStore((state) => state.friends);
  const fetchAll = useFriendsStore((state) => state.fetchAll);
  const createDirect = useChatStore((state) => state.createDirect);
  const presence = usePresenceStore((state) => state.byId);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      fetchAll().catch(() => {});
    }
  }, [open, fetchAll]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const sorted = [...friends].sort((a, b) =>
      (a.user.displayName ?? '').localeCompare(b.user.displayName ?? ''),
    );
    if (!term) return sorted;
    return sorted.filter(({ user }) =>
      `${user.displayName} ${user.username}`.toLowerCase().includes(term),
    );
  }, [friends, query]);

  const start = async (user) => {
    if (busyId) return;
    setBusyId(user.id);
    try {
      const chat = await createDirect(user.id);
      setOpen(false);
      onOpenChat?.(chat.id);
    } catch (error) {
      toast.error(getErrorMessage(error, 'That conversation could not be opened.'));
    } finally {
      setBusyId(null);
    }
  };

  const findPeople = () => {
    setOpen(false);
    navigate('/app/friends');
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="New conversation"
      description="Pick someone you are connected with, or find a new person."
      size="md"
    >
      <div className={styles.body}>
        <label className={styles.search}>
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your connections"
            aria-label="Search connections"
            autoFocus
          />
        </label>

        {results.length ? (
          <ul className={styles.list}>
            {results.map(({ user }) => {
              const state = presence[user.id];
              return (
                <li key={user.id}>
                  <button
                    type="button"
                    className={styles.person}
                    onClick={() => start(user)}
                    disabled={Boolean(busyId)}
                  >
                    <Avatar
                      user={user}
                      size="md"
                      showStatus
                      status={state?.status ?? user.status}
                    />
                    <span className={styles.personText}>
                      <strong>{user.displayName}</strong>
                      <span>@{user.username}</span>
                    </span>
                    {busyId === user.id ? (
                      <Spinner size={17} />
                    ) : (
                      <MessageCirclePlus size={18} className={styles.personIcon} />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : query ? (
          <EmptyState
            compact
            icon={Users}
            title="No match in your connections"
            description="Try a different name, or search everyone on DuoConnect."
          >
            <button type="button" className={styles.linkButton} onClick={findPeople}>
              <UserPlus size={15} /> Find people
            </button>
          </EmptyState>
        ) : friends.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title="No connections yet"
            description="Add someone first, then start a private conversation."
          >
            <button type="button" className={styles.linkButton} onClick={findPeople}>
              <UserPlus size={15} /> Find people
            </button>
          </EmptyState>
        ) : (
          <div className={styles.skeletons} aria-hidden="true">
            {[0, 1, 2].map((row) => (
              <div className={styles.skeletonRow} key={row}>
                <Skeleton width={42} height={42} radius={999} />
                <span className={styles.skeletonText}>
                  <Skeleton width="42%" height={12} />
                  <Skeleton width="26%" height={10} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { CornerUpRight, Search, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { Avatar, EmptyState, Spinner } from '../ui/Primitives';
import { useChatStore } from '../../stores/chatStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useUiStore } from '../../stores/uiStore';
import { getErrorMessage, messagePreview } from '../../lib/utils';
import styles from './ForwardModal.module.css';

export function ForwardModal() {
  const message = useUiStore((state) => state.forwardMessage);
  const close = useUiStore((state) => state.closeForward);
  const chats = useChatStore((state) => state.chats);
  const forwardMessage = useChatStore((state) => state.forwardMessage);
  const presence = usePresenceStore((state) => state.byId);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (message) setQuery('');
  }, [message]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return chats
      .filter((chat) => chat.lastMessage || chat.otherUser)
      .filter((chat) =>
        term
          ? `${chat.otherUser?.displayName ?? ''} ${chat.otherUser?.username ?? ''}`
              .toLowerCase()
              .includes(term)
          : true,
      );
  }, [chats, query]);

  const submit = async (chat) => {
    if (!message || busyId) return;
    setBusyId(chat.id);
    try {
      await forwardMessage(message.id, chat.id);
      toast.success(`Forwarded to ${chat.otherUser?.displayName ?? 'conversation'}.`);
      close();
    } catch (error) {
      toast.error(getErrorMessage(error, 'This message could not be forwarded.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      open={Boolean(message)}
      onClose={close}
      title="Forward message"
      description="Send a copy of this message to another conversation."
      size="md"
    >
      {message ? (
        <div className={styles.body}>
          <div className={styles.preview}>
            <CornerUpRight size={15} />
            <span>{messagePreview(message)}</span>
          </div>

          <label className={styles.search}>
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
              autoFocus
            />
          </label>

          {results.length ? (
            <ul className={styles.list}>
              {results.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    className={styles.chat}
                    onClick={() => submit(chat)}
                    disabled={Boolean(busyId)}
                  >
                    <Avatar
                      user={chat.otherUser}
                      size="md"
                      showStatus
                      status={presence[chat.otherUser?.id]?.status ?? chat.otherUser?.status}
                    />
                    <span className={styles.chatText}>
                      <strong>{chat.otherUser?.displayName ?? chat.name}</strong>
                      <span>{chat.lastMessage?.preview ?? 'No messages yet'}</span>
                    </span>
                    {busyId === chat.id ? <Spinner size={16} /> : <Send size={16} />}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={Send}
              title="No conversations to forward to"
              description="Start a conversation first, then try again."
            />
          )}
        </div>
      ) : null}
    </Modal>
  );
}

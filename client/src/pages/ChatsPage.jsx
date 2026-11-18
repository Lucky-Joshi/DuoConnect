import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, MessageCirclePlus, Phone, Sparkles, UserPlus, Users } from 'lucide-react';
import { Avatar, Button, Logo } from '../components/ui/Primitives';
import { ChatList } from '../components/chat/ChatList';
import { ChatThread } from '../components/chat/ChatThread';
import { useChatStore } from '../stores/chatStore';
import { useUiStore } from '../stores/uiStore';
import { cn, formatChatTimestamp, presenceLabel } from '../lib/utils';
import { usePresenceStore } from '../stores/presenceStore';
import styles from './ChatsPage.module.css';

function ConversationPlaceholder() {
  const navigate = useNavigate();
  const chats = useChatStore((state) => state.chats);
  const presence = usePresenceStore((state) => state.byId);
  const setNewChatOpen = useUiStore((state) => state.setNewChatOpen);

  const recent = [...chats]
    .sort(
      (a, b) =>
        new Date(b.lastMessage?.createdAt ?? b.updatedAt ?? 0).getTime() -
        new Date(a.lastMessage?.createdAt ?? a.updatedAt ?? 0).getTime(),
    )
    .slice(0, 3);

  return (
    <section className={styles.welcome}>
      <div className={styles.orbs} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className={styles.welcomeInner}>
        <Logo size={54} />
        <p className={styles.eyebrow}>
          <Sparkles size={13} /> Your space is ready
        </p>
        <h1>
          Conversations that feel
          <span className="serif"> close</span>
        </h1>
        <p className={styles.lead}>
          Pick up where you left off, or start something new. Everything here is private between you
          and the people you have chosen to connect with.
        </p>

        <div className={styles.actions}>
          <Button icon={MessageCirclePlus} onClick={() => setNewChatOpen(true)}>
            New conversation
          </Button>
          <Button variant="ghost" icon={UserPlus} onClick={() => navigate('/app/friends')}>
            Find people
          </Button>
        </div>

        {recent.length ? (
          <div className={styles.recentBlock}>
            <span className={styles.recentLabel}>Jump back in</span>
            <div className={styles.recentGrid}>
              {recent.map((chat) => {
                const person = chat.otherUser;
                const online = presence[person?.id]?.status ?? person?.status ?? 'offline';
                return (
                  <button
                    key={chat.id}
                    type="button"
                    className={styles.recentCard}
                    onClick={() => navigate(`/app/c/${chat.id}`)}
                  >
                    <Avatar user={person ?? chat} size="md" showStatus status={online} />
                    <span className={styles.recentBody}>
                      <span className={styles.recentTop}>
                        <strong>{person?.displayName ?? chat.name ?? 'Conversation'}</strong>
                        <time>
                          {formatChatTimestamp(chat.lastMessage?.createdAt ?? chat.updatedAt)}
                        </time>
                      </span>
                      <span className={styles.recentPreview}>
                        {chat.lastMessage?.preview ??
                          presenceLabel(online, presence[person?.id]?.lastSeenAt)}
                      </span>
                    </span>
                    <ArrowRight size={15} className={styles.recentArrow} />
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className={styles.highlights}>
          <div className={styles.highlight}>
            <span className={styles.highlightIcon}>
              <Users size={16} />
            </span>
            <strong>Built for two</strong>
            <p>Every conversation is a private thread between real connections.</p>
          </div>
          <div className={styles.highlight}>
            <span className={styles.highlightIcon}>
              <Phone size={16} />
            </span>
            <strong>Talk it through</strong>
            <p>Move from words to a call whenever a conversation needs a voice.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ChatsPage() {
  const { chatId } = useParams();

  return (
    <div className={cn(styles.page, chatId && styles.hasThread)}>
      <div className={cn(styles.listSlot, chatId && styles.listHidden)}>
        <ChatList />
      </div>
      {chatId ? (
        <ChatThread key={chatId} chatId={chatId} />
      ) : (
        <div className={styles.placeholderSlot}>
          <ConversationPlaceholder />
        </div>
      )}
    </div>
  );
}

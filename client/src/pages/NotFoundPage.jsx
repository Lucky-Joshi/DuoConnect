import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Compass, MessageCircle, PhoneCall, Sparkles, Users } from 'lucide-react';
import { Button, Logo } from '../components/ui/Primitives';
import { useAuthStore } from '../stores/authStore';
import styles from './NotFoundPage.module.css';

const QUICK_LINKS = [
  { to: '/app', label: 'Chats', description: 'Pick up a conversation', icon: MessageCircle },
  { to: '/app/friends', label: 'People', description: 'Your circle and requests', icon: Users },
  { to: '/app/calls', label: 'Calls', description: 'History and callbacks', icon: PhoneCall },
];

export default function NotFoundPage() {
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);
  const authenticated = status === 'authenticated';

  return (
    <main className={styles.page}>
      <span className={styles.glowA} aria-hidden="true" />
      <span className={styles.glowB} aria-hidden="true" />

      <header className={styles.top}>
        <Link
          to={authenticated ? '/app' : '/'}
          className={styles.brand}
          aria-label="DuoConnect home"
        >
          <Logo size={30} wordmark />
        </Link>
        <Button
          variant="ghost"
          icon={ArrowLeft}
          onClick={() => navigate(authenticated ? '/app' : '/')}
        >
          {authenticated ? 'Back to app' : 'Back home'}
        </Button>
      </header>

      <section className={styles.card}>
        <div className={styles.codeWrap} aria-hidden="true">
          <span className={styles.code}>404</span>
          <span className={styles.codeGlow} />
        </div>

        <p className={styles.eyebrow}>
          <Compass size={13} /> Off the map
        </p>
        <h1 className={styles.title}>
          This page slipped
          <span className="serif"> out of the conversation.</span>
        </h1>
        <p className={styles.lead}>
          The link may be old, or the page may have moved. Your people and conversations are still
          right where you left them.
        </p>

        <div className={styles.actions}>
          <Button icon={ArrowLeft} onClick={() => navigate(authenticated ? '/app' : '/')}>
            {authenticated ? 'Back to conversations' : 'Back home'}
          </Button>
          <Button
            variant="ghost"
            icon={authenticated ? Users : Sparkles}
            onClick={() => navigate(authenticated ? '/app/friends' : '/login')}
          >
            {authenticated ? 'Find people' : 'Sign in'}
          </Button>
        </div>

        {authenticated ? (
          <nav className={styles.quickGrid} aria-label="Quick links">
            {QUICK_LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <Link key={link.to} to={link.to} className={styles.quickLink}>
                  <span className={styles.quickIcon}>
                    <Icon size={17} />
                  </span>
                  <span className={styles.quickText}>
                    <strong>{link.label}</strong>
                    <span>{link.description}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
        ) : null}
      </section>

      <footer className={styles.footer}>
        <span>DuoConnect</span>
        <span>Close conversations, wherever you are.</span>
      </footer>
    </main>
  );
}

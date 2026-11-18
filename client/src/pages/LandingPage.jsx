import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  Check,
  Mic,
  Moon,
  Phone,
  ShieldCheck,
  Sparkles,
  Video,
  Zap,
} from 'lucide-react';
import { Avatar, Button, Logo } from '../components/ui/Primitives';
import { useAuthStore } from '../stores/authStore';
import { cn } from '../lib/utils';
import styles from './LandingPage.module.css';

const FEATURES = [
  {
    icon: Zap,
    title: 'Real-time, instantly',
    text: 'Messages, typing indicators, and receipts land the moment they happen — no refreshing.',
  },
  {
    icon: Mic,
    title: 'Voice notes that feel human',
    text: 'Record, scrub, and replay voice notes right inside the conversation.',
  },
  {
    icon: Video,
    title: 'Calls in one tap',
    text: 'Crystal-clear audio and video with screen sharing, camera switching, and live quality.',
  },
  {
    icon: ShieldCheck,
    title: 'Private by design',
    text: 'Only accepted connections can reach you. Block, mute, and control what you share.',
  },
  {
    icon: BellRing,
    title: 'Never miss a moment',
    text: 'Thoughtful notifications, delivered and read states, and pinned messages that matter.',
  },
  {
    icon: Moon,
    title: 'Make it feel like yours',
    text: 'Dark or light, five accents, and calm wallpapers — your space, your pace.',
  },
];

const PREVIEW_PERSON = { name: 'Your friend', username: 'friend', id: 'friend' };

const MESSAGES = [
  {
    id: 'm1',
    own: false,
    person: PREVIEW_PERSON,
    text: 'The new motion pass is ready. Want a look before I hand it off?',
    time: '9:41',
  },
  {
    id: 'm2',
    own: true,
    person: PREVIEW_PERSON,
    text: 'Absolutely. Send it over 👀',
    time: '9:41',
  },
  {
    id: 'm3',
    own: false,
    person: PREVIEW_PERSON,
    text: 'Voice note',
    time: '9:42',
    voice: true,
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);
  const scroller = useRef(null);

  const authenticated = status === 'authenticated';

  return (
    <div className={styles.landing} ref={scroller}>
      <div className={styles.aurora} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <header className={styles.nav}>
        <button
          type="button"
          className={styles.brand}
          onClick={() => scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <Logo size={34} />
          <span>
            Duo<em>Connect</em>
          </span>
        </button>
        <nav className={styles.navLinks} aria-label="Landing navigation">
          <a href="#features">Features</a>
          <a href="#conversation">A look inside</a>
          <a href="#conversation">Preview</a>
        </nav>
        <div className={styles.navActions}>
          {authenticated ? (
            <Button size="sm" icon={ArrowRight} onClick={() => navigate('/app')}>
              Open DuoConnect
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => navigate('/login')}>
                Sign in
              </Button>
              <Button size="sm" icon={Sparkles} onClick={() => navigate('/register')}>
                Get started
              </Button>
            </>
          )}
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <Sparkles size={13} /> Real-time conversations, beautifully done
            </span>
            <h1>
              Talk like you are in
              <span className="serif"> the same room</span>
            </h1>
            <p className={styles.lead}>
              DuoConnect brings your closest conversations together — messages, voice notes, and
              crystal-clear calls in one calm, private space.
            </p>

            <div className={styles.heroActions}>
              <Button
                size="lg"
                icon={ArrowRight}
                onClick={() => navigate(authenticated ? '/app' : '/register')}
              >
                {authenticated ? 'Open your conversations' : 'Create your account'}
              </Button>
              <Button
                size="lg"
                variant="ghost"
                onClick={() =>
                  document.getElementById('conversation')?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                See a preview
              </Button>
            </div>

            <p className={styles.trust}>
              <Check size={14} /> No credit card
              <span />
              <Check size={14} /> Private between connections
              <span />
              <Check size={14} /> Works in your browser
            </p>
          </div>

          <div className={styles.showcase} aria-label="Preview of a DuoConnect conversation">
            <div className={styles.showcaseGlow} aria-hidden="true" />
            <div className={styles.chatCard}>
              <div className={styles.chatHead}>
                <Avatar
                  user={{
                    displayName: PREVIEW_PERSON.name,
                    username: PREVIEW_PERSON.username,
                    id: PREVIEW_PERSON.id,
                  }}
                  size="sm"
                  showStatus
                  status="online"
                />
                <div>
                  <strong>Your friend</strong>
                  <span>Online now · typing…</span>
                </div>
                <div className={styles.chatHeadActions}>
                  <span>
                    <Phone size={14} />
                  </span>
                  <span>
                    <Video size={14} />
                  </span>
                </div>
              </div>

              <div className={styles.chatBody}>
                <span className={styles.chatDay}>Today</span>
                {MESSAGES.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      styles.bubbleRow,
                      message.own ? styles.ownRow : styles.receivedRow,
                    )}
                  >
                    {!message.own ? (
                      <Avatar
                        user={{
                          displayName: message.person.name,
                          username: message.person.username,
                          id: message.person.username,
                        }}
                        size={26}
                      />
                    ) : null}
                    <div
                      className={cn(
                        styles.bubble,
                        message.own ? styles.bubbleOwn : styles.bubbleReceived,
                      )}
                    >
                      {message.voice ? (
                        <span className={styles.voice}>
                          <i className={styles.playDot} />
                          <span className={styles.wave} aria-hidden="true">
                            {[6, 12, 18, 10, 16, 22, 13, 8, 17, 11, 20, 7, 14, 19, 9].map(
                              (height, index) => (
                                <b key={index} style={{ height }} />
                              ),
                            )}
                          </span>
                          <span>0:14</span>
                        </span>
                      ) : (
                        <span>{message.text}</span>
                      )}
                      <span className={styles.bubbleTime}>{message.time}</span>
                    </div>
                  </div>
                ))}

                <div className={styles.typing}>
                  <i />
                  <i />
                  <i />
                  Your friend is typing…
                </div>
              </div>

              <div className={styles.chatComposer}>
                <span className={styles.composerPlus}>+</span>
                <span className={styles.composerText}>Message your friend…</span>
                <span className={styles.composerSend}>
                  <ArrowRight size={15} />
                </span>
              </div>
            </div>

            <div className={styles.callCard}>
              <span className={styles.callAvatar}>
                <Avatar
                  user={{
                    displayName: PREVIEW_PERSON.name,
                    username: PREVIEW_PERSON.username,
                    id: PREVIEW_PERSON.id,
                  }}
                  size={38}
                />
                <i />
              </span>
              <div>
                <strong>Your friend</strong>
                <span>Video call · 04:12</span>
              </div>
              <span className={styles.callPulse}>
                <Video size={15} />
              </span>
            </div>

            <div className={styles.presenceCard}>
              <span className={styles.presenceDot} />
              <div>
                <strong>3 friends online</strong>
                <span>Ready when you are</span>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className={styles.features}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Everything in one place</span>
            <h2>Built for the conversations that matter</h2>
            <p>
              No clutter, no noise. Just the tools you reach for every day, designed to feel
              effortless.
            </p>
          </div>
          <div className={styles.featureGrid}>
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <article className={styles.feature} key={title}>
                <span className={styles.featureIcon}>
                  <Icon size={18} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="conversation" className={styles.split}>
          <div className={styles.splitCopy}>
            <span className={styles.eyebrow}>A look inside</span>
            <h2>One calm place for text, voice, and face time</h2>
            <p>
              Start with a message. Send a voice note when you cannot find the words. Jump into a
              call when you need to laugh out loud. DuoConnect keeps the thread intact.
            </p>
            <ul className={styles.checks}>
              <li>
                <Check size={14} /> Edit, reply, pin, forward, and delete with confidence
              </li>
              <li>
                <Check size={14} /> Delivered and seen receipts you can actually trust
              </li>
              <li>
                <Check size={14} /> Screen sharing, camera switching, and in-call quality insights
              </li>
            </ul>
          </div>
          <div className={styles.splitStack}>
            <div className={styles.stackCard}>
              <span className={styles.stackLabel}>In call</span>
              <div className={styles.callGrid}>
                <span>
                  <Avatar user={{ displayName: 'You', username: 'you', id: 'you' }} size={54} />
                  <i className={styles.stackMic}>
                    <Mic size={12} />
                  </i>
                </span>
                <span className={styles.callTile}>
                  <Avatar
                    user={{
                      displayName: PREVIEW_PERSON.name,
                      username: PREVIEW_PERSON.username,
                      id: PREVIEW_PERSON.id,
                    }}
                    size={54}
                  />
                </span>
              </div>
              <div className={styles.callMeta}>
                <span className={styles.liveDot} /> Live · 12:04
                <span className={styles.quality}>Excellent</span>
              </div>
            </div>
            <div className={styles.stackCardSmall}>
              <span className={styles.stackLabel}>Today</span>
              <div className={styles.miniReceipt}>
                <span>Design sync notes sent</span>
                <span className={styles.miniCheck}>
                  <Check size={12} /> Seen
                </span>
              </div>
              <div className={styles.miniReceipt}>
                <span>Voice note · 0:22</span>
                <span className={styles.miniWave} aria-hidden="true">
                  {[5, 9, 14, 7, 12, 18, 10, 6, 13, 8].map((height, index) => (
                    <b key={index} style={{ height }} />
                  ))}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <h2>
            Your next great conversation is
            <span className="serif"> waiting</span>
          </h2>
          <p>Create an account and bring your people together in one calm, beautiful place.</p>
          <div className={styles.finalActions}>
            <Button
              size="lg"
              icon={ArrowRight}
              onClick={() => navigate(authenticated ? '/app' : '/register')}
            >
              {authenticated ? 'Open DuoConnect' : 'Get started free'}
            </Button>
            <Button size="lg" variant="ghost" onClick={() => navigate('/login')}>
              I already have an account
            </Button>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <Logo size={28} />
          <span>
            Duo<em>Connect</em>
          </span>
        </div>
        <p>Made for close connections. Built with care.</p>
        <div className={styles.footerLinks}>
          <button type="button" onClick={() => navigate('/login')}>
            Sign in
          </button>
          <button type="button" onClick={() => navigate('/register')}>
            Create account
          </button>
          <a href="#features">Features</a>
        </div>
      </footer>
    </div>
  );
}

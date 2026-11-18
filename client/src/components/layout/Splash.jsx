import { Logo } from '../ui/Primitives';
import styles from './Splash.module.css';

export function Splash({ label = 'Opening your space…' }) {
  return (
    <div className={styles.splash} role="status" aria-live="polite">
      <div className={styles.aurora} aria-hidden="true" />
      <div className={styles.mark}>
        <Logo size={54} />
      </div>
      <p className={styles.wordmark}>
        Duo<span>Connect</span>
      </p>
      <p className={styles.label}>{label}</p>
      <span className={styles.bar} aria-hidden="true">
        <span />
      </span>
    </div>
  );
}

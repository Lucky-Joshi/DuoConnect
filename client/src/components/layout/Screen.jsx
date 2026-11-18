import { cn } from '../../lib/utils';
import styles from './Screen.module.css';

export function Screen({ children, className }) {
  return (
    <section className={cn(styles.screen, className)}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.inner}>{children}</div>
    </section>
  );
}

export function ScreenHeader({ eyebrow, title, description, actions, icon: Icon, children }) {
  return (
    <header className={styles.header}>
      <div className={styles.heading}>
        {eyebrow ? (
          <span className={styles.eyebrow}>
            {Icon ? <Icon size={13} /> : null}
            {eyebrow}
          </span>
        ) : null}
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
        {children}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}

export function ScreenBody({ children, className }) {
  return <div className={cn(styles.body, className)}>{children}</div>;
}

export function Section({ title, description, actions, children, className }) {
  return (
    <section className={cn(styles.section, className)}>
      {title || actions ? (
        <div className={styles.sectionHead}>
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className={styles.sectionActions}>{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Card({ children, className, as = 'div', ...rest }) {
  const Tag = as;
  return (
    <Tag className={cn(styles.card, className)} {...rest}>
      {children}
    </Tag>
  );
}

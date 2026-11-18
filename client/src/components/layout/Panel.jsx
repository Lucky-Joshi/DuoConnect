import { cn } from '../../lib/utils';
import styles from './Panel.module.css';

export function Panel({ children, className }) {
  return <aside className={cn(styles.panel, className)}>{children}</aside>;
}

export function PanelHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <header className={styles.header}>
      <div className={styles.heading}>
        <h1 className={styles.title}>
          {Icon ? <Icon size={19} className={styles.titleIcon} /> : null}
          {title}
        </h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}

export function PanelSearch({ value, onChange, placeholder = 'Search', onClear, children }) {
  return (
    <div className={styles.searchWrap}>
      <div className={styles.search}>
        {children}
        <input
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange?.(event.target.value)}
          className={styles.searchInput}
          aria-label={placeholder}
        />
        {value ? (
          <button
            type="button"
            className={styles.clear}
            onClick={onClear}
            aria-label="Clear search"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function PanelScroll({ children, className, ...rest }) {
  return (
    <div className={cn(styles.scroll, className)} {...rest}>
      {children}
    </div>
  );
}

export function PanelFooter({ children }) {
  return <footer className={styles.footer}>{children}</footer>;
}

export function PanelLabel({ children, action }) {
  return (
    <div className={styles.label}>
      <span>{children}</span>
      {action}
    </div>
  );
}

import { useId } from 'react';
import { avatarGradient, cn, initials, mediaUrl } from '../../lib/utils';
import styles from './Primitives.module.css';

/* Brand ------------------------------------------------------------------ */

export function Logo({ size = 34, wordmark = false, className }) {
  const gradientId = useId().replace(/[:]/g, '');

  return (
    <span className={cn(styles.logo, className)}>
      <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        <path
          d="M14.5 4h11A9.5 9.5 0 0 1 35 13.5v3a9.5 9.5 0 0 1-9.5 9.5H17l-7.4 6.1A1.4 1.4 0 0 1 7.4 31v-5.9A9.5 9.5 0 0 1 4 16.5v-3A9.5 9.5 0 0 1 14.5 4Z"
          fill={`url(#${gradientId})`}
          opacity="0.92"
        />
        <path
          d="M23 17h7.5A9.5 9.5 0 0 1 40 26.5v2A9.5 9.5 0 0 1 30.5 38H28l-6.2 5a1.2 1.2 0 0 1-2-1v-4.6A9.5 9.5 0 0 1 14 28.4v-2a9.5 9.5 0 0 1 9-9.4Z"
          fill="var(--glass-bg-strong)"
          stroke={`url(#${gradientId})`}
          strokeWidth="2.4"
        />
        <circle cx="24.5" cy="27.6" r="1.7" fill="var(--accent)" />
        <circle cx="30" cy="27.6" r="1.7" fill="var(--accent)" />
        <circle cx="35.5" cy="27.6" r="1.7" fill="var(--accent)" />
      </svg>
      {wordmark ? (
        <span className={styles.wordmark}>
          Duo<span className={styles.wordmarkAccent}>Connect</span>
        </span>
      ) : null}
    </span>
  );
}

export function Wordmark({ compact = false }) {
  return (
    <span className={cn(styles.wordmark, compact && styles.wordmarkCompact)}>
      Duo<span className={styles.wordmarkAccent}>Connect</span>
    </span>
  );
}

/* Avatar ----------------------------------------------------------------- */

const avatarSizes = { xs: 26, sm: 34, md: 42, lg: 56, xl: 84, xxl: 112 };

export function Avatar({
  user,
  size = 'md',
  status,
  showStatus = false,
  ring = false,
  className,
  onClick,
}) {
  const pixels = typeof size === 'number' ? size : (avatarSizes[size] ?? 42);
  const name = user?.displayName || user?.username || 'Unknown';
  const image = user?.avatarUrl ? mediaUrl(user.avatarUrl) : null;
  const Tag = onClick ? 'button' : 'span';
  const online = status === 'online';
  const away = status === 'away';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        styles.avatar,
        onClick && styles.avatarButton,
        ring && styles.avatarRing,
        className,
      )}
      style={{
        width: pixels,
        height: pixels,
        background: image ? undefined : avatarGradient(user?.id || name),
        fontSize: Math.max(10, Math.round(pixels * 0.34)),
      }}
      aria-label={onClick ? `Open ${name}'s profile` : undefined}
    >
      {image ? <img src={image} alt="" loading="lazy" /> : <span>{initials(name)}</span>}
      {showStatus ? (
        <i
          className={cn(
            styles.status,
            online && styles.statusOnline,
            away && styles.statusAway,
            !online && !away && styles.statusOffline,
          )}
          style={{ width: Math.max(9, Math.round(pixels * 0.26)) }}
          aria-label={online ? 'Online' : away ? 'Away' : 'Offline'}
        />
      ) : null}
    </Tag>
  );
}

/* Buttons ---------------------------------------------------------------- */

export function Spinner({ size = 16, className }) {
  return (
    <span
      className={cn(styles.spinner, className)}
      style={{ width: size, height: size, borderWidth: Math.max(1.5, size / 9) }}
      aria-hidden="true"
    />
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon = null,
  loading = false,
  fullWidth = false,
  className,
  type = 'button',
  disabled,
  ...rest
}) {
  return (
    <button
      type={type}
      className={cn(
        styles.button,
        styles[`button_${variant}`],
        styles[`button_${size}`],
        fullWidth && styles.fullWidth,
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === 'sm' ? 13 : 16} />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 15 : 17} />
      ) : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function IconButton({
  children,
  label,
  active = false,
  tone = 'default',
  size = 'md',
  className,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        styles.iconButton,
        styles[`iconButton_${size}`],
        active && styles.iconButtonActive,
        tone === 'danger' && styles.iconButtonDanger,
        tone === 'accent' && styles.iconButtonAccent,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* Inputs ----------------------------------------------------------------- */

export function TextField({
  label,
  hint,
  error,
  icon: Icon = null,
  trailing = null,
  as = 'input',
  className,
  rows = 3,
  id,
  ...rest
}) {
  const generated = useId();
  const inputId = id ?? generated;
  const Tag = as;

  return (
    <label className={cn(styles.field, className)} htmlFor={inputId}>
      {label ? (
        <span className={styles.fieldLabel}>
          {label}
          {hint ? <span className={styles.fieldHint}>{hint}</span> : null}
        </span>
      ) : null}
      <span
        className={cn(styles.inputWrap, error && styles.inputWrapError, Icon && styles.hasIcon)}
      >
        {Icon ? <Icon size={17} className={styles.inputIcon} aria-hidden="true" /> : null}
        <Tag
          id={inputId}
          className={cn(styles.input, Tag === 'textarea' && styles.textarea)}
          rows={Tag === 'textarea' ? rows : undefined}
          aria-invalid={error ? 'true' : undefined}
          {...rest}
        />
        {trailing ? <span className={styles.inputTrailing}>{trailing}</span> : null}
      </span>
      {error ? <span className={styles.fieldError}>{error}</span> : null}
    </label>
  );
}

export function SelectField({ label, error, children, className, id, ...rest }) {
  const generated = useId();
  const selectId = id ?? generated;
  return (
    <label className={cn(styles.field, className)} htmlFor={selectId}>
      {label ? <span className={styles.fieldLabel}>{label}</span> : null}
      <span className={cn(styles.inputWrap, error && styles.inputWrapError)}>
        <select id={selectId} className={cn(styles.input, styles.select)} {...rest}>
          {children}
        </select>
      </span>
      {error ? <span className={styles.fieldError}>{error}</span> : null}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description, disabled = false, id }) {
  const generated = useId();
  const toggleId = id ?? generated;
  return (
    <div className={cn(styles.toggleRow, disabled && styles.toggleDisabled)}>
      <label className={styles.toggleText} htmlFor={toggleId}>
        <span className={styles.toggleLabel}>{label}</span>
        {description ? <span className={styles.toggleDescription}>{description}</span> : null}
      </label>
      <button
        id={toggleId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={cn(styles.switch, checked && styles.switchOn)}
        onClick={() => onChange?.(!checked)}
      >
        <span className={styles.switchThumb} />
      </button>
    </div>
  );
}

/* Misc ------------------------------------------------------------------- */

export function Badge({ count, dot = false, tone = 'accent', className }) {
  if (!dot && (!count || count <= 0)) return null;
  return (
    <span className={cn(styles.badge, styles[`badge_${tone}`], dot && styles.badgeDot, className)}>
      {dot ? null : count > 99 ? '99+' : count}
    </span>
  );
}

export function Segmented({ options, value, onChange, className, size = 'md' }) {
  return (
    <div className={cn(styles.segmented, styles[`segmented_${size}`], className)} role="tablist">
      {options.map((option) => {
        const id = option.id ?? option.value;
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={cn(styles.segment, selected && styles.segmentActive)}
            onClick={() => onChange?.(id)}
          >
            {option.icon ? <option.icon size={15} /> : null}
            <span>{option.label}</span>
            {option.count ? <span className={styles.segmentCount}>{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
  compact = false,
}) {
  return (
    <div className={cn(styles.empty, compact && styles.emptyCompact, className)}>
      {Icon ? (
        <span className={styles.emptyIcon}>
          <Icon size={compact ? 22 : 28} />
        </span>
      ) : null}
      <h3 className={styles.emptyTitle}>{title}</h3>
      {description ? <p className={styles.emptyText}>{description}</p> : null}
      {children ? <div className={styles.emptyAction}>{children}</div> : null}
    </div>
  );
}

export function Skeleton({ width = '100%', height = 14, radius = 8, className }) {
  return (
    <span
      className={cn(styles.skeleton, className)}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function Divider({ className }) {
  return <span className={cn(styles.divider, className)} role="separator" />;
}

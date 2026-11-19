import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft,
  AtSign,
  Bell,
  Camera,
  Check,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Trash2,
  UserRound,
  Volume2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Screen, ScreenHeader, ScreenBody, Section, Card } from '../components/layout/Screen';
import {
  Avatar,
  Button,
  EmptyState,
  SelectField,
  Skeleton,
  TextField,
  Toggle,
} from '../components/ui/Primitives';
import { Modal } from '../components/ui/Modal';
import { api, unwrap } from '../lib/api';
import { ACCENTS, MAX_AVATAR_MB, PRESENCE_VISIBILITY, THEMES, WALLPAPERS } from '../lib/constants';
import {
  disablePush,
  enablePush,
  hasPushSubscription,
  pushPermission,
  pushSupported,
  sendTestPush,
} from '../lib/push';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import { cn, formatRelative, getErrorDetails, getErrorMessage, playChime } from '../lib/utils';
import styles from './SettingsPage.module.css';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'account', label: 'Account', icon: Trash2 },
];

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor };

function mapServerErrors(details, setError, paths) {
  if (!Array.isArray(details)) return false;
  let mapped = false;
  for (const detail of details) {
    if (paths.includes(detail.path)) {
      setError(detail.path, { type: 'server', message: detail.message });
      mapped = true;
    }
  }
  return mapped;
}

function describeAgent(userAgent = '') {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const platform = /Windows/.test(userAgent)
    ? 'Windows'
    : /Macintosh|Mac OS X/.test(userAgent)
      ? 'macOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad|iPod/.test(userAgent)
          ? 'iOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'this device';
  const mobile = /Android|iPhone|iPad|iPod/.test(userAgent);
  return { label: `${browser} on ${platform}`, mobile };
}

function SecretField({ label, error, autoComplete, ...rest }) {
  const [reveal, setReveal] = useState(false);
  return (
    <TextField
      label={label}
      type={reveal ? 'text' : 'password'}
      icon={Lock}
      autoComplete={autoComplete}
      error={error}
      trailing={
        <button
          type="button"
          className={styles.reveal}
          onClick={() => setReveal((value) => !value)}
          aria-label={reveal ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      }
      {...rest}
    />
  );
}

/* Profile ---------------------------------------------------------------- */

function ProfilePanel() {
  const user = useAuthStore((state) => state.user);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    defaultValues: {
      displayName: user?.displayName ?? '',
      username: user?.username ?? '',
      about: user?.about ?? '',
    },
    mode: 'onBlur',
  });

  const about = watch('about') ?? '';

  const pickAvatar = () => fileRef.current?.click();

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file for your profile photo.');
      return;
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      toast.error(`Choose an image smaller than ${MAX_AVATAR_MB} MB.`);
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('avatar', file);
      const stored = unwrap(await api.post('/uploads/avatar', form));
      await updateProfile({ avatarUrl: stored.url });
      toast.success('Profile photo updated.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'That photo could not be uploaded.'));
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await updateProfile({ avatarUrl: '' });
      toast.success('Profile photo removed.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'That photo could not be removed.'));
    } finally {
      setRemoving(false);
    }
  };

  const submit = async (values) => {
    try {
      const data = await updateProfile({
        displayName: values.displayName.trim(),
        username: values.username.trim().toLowerCase(),
        about: values.about.trim(),
      });
      reset({
        displayName: data.user.displayName,
        username: data.user.username,
        about: data.user.about ?? '',
      });
      toast.success('Profile saved.');
    } catch (error) {
      const details = getErrorDetails(error);
      if (!mapServerErrors(details, setError, ['displayName', 'username', 'about'])) {
        toast.error(getErrorMessage(error, 'Your profile could not be saved.'));
      }
    }
  };

  return (
    <Section
      title="Profile"
      description="How you show up across DuoConnect. You can change this whenever you like."
    >
      <Card className={styles.panel}>
        <div className={styles.avatarRow}>
          <div className={styles.avatarBlock}>
            <Avatar user={user} size="xl" />
            <span className={styles.avatarBadge} aria-hidden="true">
              <Camera size={13} />
            </span>
          </div>
          <div className={styles.avatarCopy}>
            <strong>Profile photo</strong>
            <p>PNG, JPG, GIF, or WebP up to {MAX_AVATAR_MB} MB. A clear face works best.</p>
            <div className={styles.avatarActions}>
              <Button
                size="sm"
                variant="secondary"
                icon={Camera}
                loading={uploading}
                onClick={pickAvatar}
              >
                {user?.avatarUrl ? 'Change photo' : 'Upload photo'}
              </Button>
              {user?.avatarUrl ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  loading={removing}
                  onClick={removeAvatar}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={uploadAvatar}
          />
        </div>

        <form className={styles.form} onSubmit={handleSubmit(submit)}>
          <div className={styles.fieldGrid}>
            <TextField
              label="Display name"
              icon={UserRound}
              error={errors.displayName?.message}
              maxLength={40}
              {...register('displayName', {
                required: 'Add a display name.',
                maxLength: { value: 40, message: 'Keep your name under 40 characters.' },
              })}
            />
            <TextField
              label="Username"
              icon={AtSign}
              hint="Used to find you"
              error={errors.username?.message}
              autoCapitalize="none"
              spellCheck={false}
              {...register('username', {
                required: 'Choose a username.',
                minLength: { value: 3, message: 'Use at least 3 characters.' },
                maxLength: { value: 24, message: 'Keep it under 24 characters.' },
                pattern: {
                  value: /^[a-zA-Z0-9][a-zA-Z0-9._]*[a-zA-Z0-9]$/,
                  message: 'Use letters, numbers, dots, or underscores.',
                },
              })}
            />
          </div>

          <TextField
            label="About you"
            hint={`${about.length}/280`}
            as="textarea"
            rows={3}
            error={errors.about?.message}
            maxLength={280}
            placeholder="A line about what you care about, work on, or want to talk about."
            {...register('about', {
              maxLength: { value: 280, message: 'Keep your bio under 280 characters.' },
            })}
          />

          <div className={styles.formFoot}>
            <span className={styles.formHint}>
              Your display name and photo are visible to everyone on DuoConnect.
            </span>
            <Button type="submit" icon={Check} loading={isSubmitting} disabled={!isDirty}>
              Save changes
            </Button>
          </div>
        </form>
      </Card>
    </Section>
  );
}

/* Appearance ------------------------------------------------------------- */

function AppearancePanel() {
  const settings = useAuthStore((state) => state.settings);
  const updateSettings = useAuthStore((state) => state.updateSettings);
  const reduceMotion = useUiStore((state) => state.reduceMotion);
  const setReduceMotion = useUiStore((state) => state.setReduceMotion);
  const [saving, setSaving] = useState(null);

  const apply = async (key, patch) => {
    if (saving) return;
    setSaving(key);
    try {
      await updateSettings(patch);
    } catch (error) {
      toast.error(getErrorMessage(error, 'That appearance change could not be saved.'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Section
      title="Appearance"
      description="Make the room yours. Changes apply immediately and follow your account."
    >
      <Card className={styles.panel}>
        <div className={styles.panelBlock}>
          <div className={styles.blockHead}>
            <strong>Theme</strong>
            <span>Choose how bright your workspace feels.</span>
          </div>
          <div className={styles.themeGrid} role="group" aria-label="Theme">
            {THEMES.map((theme) => {
              const Icon = THEME_ICONS[theme.id] ?? Monitor;
              const selected = (settings?.theme ?? 'dark') === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  className={cn(styles.themeCard, selected && styles.themeCardActive)}
                  aria-pressed={selected}
                  disabled={saving === 'theme'}
                  onClick={() => apply('theme', { theme: theme.id })}
                >
                  <span className={styles.themeIcon} data-theme-id={theme.id}>
                    <Icon size={17} />
                  </span>
                  <span>{theme.label}</span>
                  {selected ? <Check size={13} className={styles.selectedCheck} /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.panelBlock}>
          <div className={styles.blockHead}>
            <strong>Accent colour</strong>
            <span>Used for highlights, calls to action, and your presence.</span>
          </div>
          <div className={styles.accentGrid} role="group" aria-label="Accent colour">
            {ACCENTS.map((accent) => {
              const selected = (settings?.accent ?? 'violet') === accent.id;
              return (
                <button
                  key={accent.id}
                  type="button"
                  className={cn(styles.accentCard, selected && styles.accentCardActive)}
                  aria-pressed={selected}
                  disabled={saving === 'accent'}
                  onClick={() => apply('accent', { accent: accent.id })}
                >
                  <span
                    className={styles.accentSwatch}
                    style={{
                      background: `linear-gradient(135deg, ${accent.colors[0]}, ${accent.colors[1]})`,
                    }}
                  />
                  <span>{accent.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.panelBlock}>
          <div className={styles.blockHead}>
            <strong>Chat wallpaper</strong>
            <span>The backdrop behind your conversations.</span>
          </div>
          <div className={styles.wallpaperGrid} role="group" aria-label="Chat wallpaper">
            {WALLPAPERS.map((wallpaper) => {
              const selected = (settings?.wallpaper ?? 'aurora') === wallpaper.id;
              return (
                <button
                  key={wallpaper.id}
                  type="button"
                  className={cn(styles.wallpaperCard, selected && styles.wallpaperCardActive)}
                  aria-pressed={selected}
                  disabled={saving === 'wallpaper'}
                  onClick={() => apply('wallpaper', { wallpaper: wallpaper.id })}
                >
                  <span className={styles.wallpaperPreview} data-preview={wallpaper.id} />
                  <span className={styles.wallpaperLabel}>
                    {wallpaper.label}
                    {selected ? <Check size={12} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.panelBlock}>
          <Toggle
            label="Reduce motion"
            description="Limit animations and transitions across the interface."
            checked={reduceMotion}
            onChange={setReduceMotion}
          />
        </div>
      </Card>
    </Section>
  );
}

/* Notifications ---------------------------------------------------------- */

function NotificationsPanel() {
  const settings = useAuthStore((state) => state.settings);
  const updateSettings = useAuthStore((state) => state.updateSettings);
  const [saving, setSaving] = useState(null);
  const [pushEnabledState, setPushEnabledState] = useState(false);
  const { canInstall, isIOS, installed, install } = useInstallPrompt();

  const prefs = settings?.notifications ?? {};
  const desktopSupported = typeof window !== 'undefined' && 'Notification' in window;
  const permission = desktopSupported ? window.Notification.permission : 'denied';

  useEffect(() => {
    let active = true;
    hasPushSubscription().then((subscribed) => {
      if (active) setPushEnabledState(subscribed);
    });
    return () => {
      active = false;
    };
  }, []);

  const save = async (key, value) => {
    if (saving) return;
    setSaving(key);
    try {
      await updateSettings({ notifications: { [key]: value } });
    } catch (error) {
      toast.error(getErrorMessage(error, 'That notification setting could not be saved.'));
    } finally {
      setSaving(null);
    }
  };

  const toggleDesktop = async (next) => {
    if (!next) {
      await save('desktop', false);
      return;
    }
    if (!desktopSupported) {
      toast.error('This browser does not support desktop notifications.');
      return;
    }
    let state = window.Notification.permission;
    if (state === 'default') state = await window.Notification.requestPermission();
    if (state !== 'granted') {
      toast.error('Desktop notifications are blocked. Allow them in your browser settings first.');
      return;
    }
    await save('desktop', true);
  };

  const testPush = async () => {
    if (saving) return;
    setSaving('test');
    try {
      await sendTestPush();
      toast.success('Test notification sent.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not send the test notification.'));
    } finally {
      setSaving(null);
    }
  };

  const installApp = async () => {
    try {
      if (await install()) toast.success('DuoConnect installed.');
    } catch {
      toast.error('The app could not be installed from this browser.');
    }
  };

  const togglePush = async (next) => {
    if (saving) return;
    setSaving('push');
    try {
      if (next) {
        await enablePush();
        setPushEnabledState(true);
        toast.success('Push notifications are on.');
      } else {
        await disablePush();
        setPushEnabledState(false);
        toast.success('Push notifications are off.');
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Push notifications could not be changed.'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Section title="Notifications" description="Decide what reaches you, and how loudly.">
      <Card className={styles.panel}>
        <div className={styles.toggleStack}>
          <Toggle
            label="New messages"
            description="Get a notification when a message arrives while you are away."
            checked={prefs.messages !== false}
            disabled={Boolean(saving)}
            onChange={(value) => save('messages', value)}
          />
          <Toggle
            label="Connection requests"
            description="Know when someone asks to connect, and when a request is accepted."
            checked={prefs.friendRequests !== false}
            disabled={Boolean(saving)}
            onChange={(value) => save('friendRequests', value)}
          />
          <Toggle
            label="Calls"
            description="Missed calls and call updates land in your activity."
            checked={prefs.calls !== false}
            disabled={Boolean(saving)}
            onChange={(value) => save('calls', value)}
          />
          <Toggle
            label="Notification sounds"
            description="A soft chime for messages, requests, and activity."
            checked={prefs.sounds !== false}
            disabled={Boolean(saving)}
            onChange={(value) => save('sounds', value)}
          />
          <Toggle
            label="Push notifications"
            description={
              !pushSupported()
                ? 'Requires a supported browser and a configured push key.'
                : pushPermission() === 'denied'
                  ? 'Blocked in your browser. Allow notifications in site settings first.'
                  : 'Get messages and calls even when DuoConnect is closed. On iPhone, add the site to your Home Screen first.'
            }
            checked={pushEnabledState && pushPermission() === 'granted'}
            disabled={Boolean(saving) || !pushSupported()}
            onChange={togglePush}
          />
          <Toggle
            label="Desktop notifications"
            description={
              desktopSupported
                ? permission === 'granted'
                  ? 'Show a system notification when DuoConnect is in the background.'
                  : 'Allow browser notifications when you turn this on.'
                : 'This browser does not support desktop notifications.'
            }
            checked={Boolean(prefs.desktop) && permission === 'granted'}
            disabled={Boolean(saving) || !desktopSupported}
            onChange={toggleDesktop}
          />
        </div>

        {pushSupported() && (
          <div className={styles.inlineFoot}>
            <span className={styles.formHint}>
              {pushEnabledState
                ? 'Push is active on this browser. Send a test to confirm alerts arrive with the page closed.'
                : 'Turn on Push notifications, then send a test to confirm alerts arrive with the page closed.'}
            </span>
            <Button
              size="sm"
              variant="ghost"
              icon={Bell}
              disabled={Boolean(saving) || !pushEnabledState}
              onClick={testPush}
            >
              Send test notification
            </Button>
          </div>
        )}

        {!installed && (canInstall || isIOS) && (
          <div className={styles.inlineFoot}>
            <span className={styles.formHint}>
              {isIOS
                ? 'On iPhone, tap Share, then Add to Home Screen before enabling push.'
                : 'Install DuoConnect for a full-screen app and more reliable background alerts.'}
            </span>
            {canInstall && (
              <Button
                size="sm"
                variant="secondary"
                icon={Download}
                disabled={Boolean(saving)}
                onClick={installApp}
              >
                Install app
              </Button>
            )}
          </div>
        )}

        <div className={styles.inlineFoot}>
          <span className={styles.formHint}>
            System sounds are synthesized in your browser — nothing is downloaded.
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon={Volume2}
            disabled={prefs.sounds === false}
            onClick={() => playChime('message')}
          >
            Play test sound
          </Button>
        </div>
      </Card>
    </Section>
  );
}

/* Privacy ---------------------------------------------------------------- */

function PrivacyPanel() {
  const settings = useAuthStore((state) => state.settings);
  const updateSettings = useAuthStore((state) => state.updateSettings);
  const [saving, setSaving] = useState(null);

  const privacy = settings?.privacy ?? {};

  const save = async (key, value) => {
    if (saving) return;
    setSaving(key);
    try {
      await updateSettings({ privacy: { [key]: value } });
    } catch (error) {
      toast.error(getErrorMessage(error, 'That privacy setting could not be saved.'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Section
      title="Privacy"
      description="You decide what other people can see about your activity."
    >
      <Card className={styles.panel}>
        <Toggle
          label="Read receipts"
          description="Let people know when you have read their messages. Turning this off stops your receipts from sending."
          checked={privacy.readReceipts !== false}
          disabled={Boolean(saving)}
          onChange={(value) => save('readReceipts', value)}
        />

        <div className={styles.fieldGrid}>
          <SelectField
            label="Who can see when you are online"
            value={privacy.presence ?? 'friends'}
            disabled={Boolean(saving)}
            onChange={(event) => save('presence', event.target.value)}
          >
            {PRESENCE_VISIBILITY.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Who can see your last seen"
            value={privacy.lastSeen ?? 'friends'}
            disabled={Boolean(saving)}
            onChange={(event) => save('lastSeen', event.target.value)}
          >
            {PRESENCE_VISIBILITY.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </div>

        <p className={styles.panelNote}>
          Choosing “Nobody” keeps your activity private, but it also means you will not see presence
          details for people who choose the same.
        </p>
      </Card>
    </Section>
  );
}

/* Security --------------------------------------------------------------- */

function SessionsCard() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const data = unwrap(await api.get('/auth/sessions'));
      setSessions(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (session) => {
    if (revoking) return;
    setRevoking(session.id);
    try {
      await api.delete(`/auth/sessions/${session.id}`);
      setSessions((current) => current.filter((item) => item.id !== session.id));
      toast.success('That session has been signed out.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'That session could not be signed out.'));
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className={styles.panelBlock}>
      <div className={styles.blockHead}>
        <strong>Active sessions</strong>
        <span>Devices that are currently signed in to your account.</span>
      </div>

      {loading ? (
        <div className={styles.sessionList} aria-hidden="true">
          {[0, 1].map((index) => (
            <div key={index} className={styles.sessionRow}>
              <Skeleton width={36} height={36} radius={10} />
              <span className={styles.sessionText}>
                <Skeleton width="46%" height={11} />
                <Skeleton width="30%" height={9} />
              </span>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className={styles.inlineError}>
          <span>{getErrorMessage(error, 'Sessions could not be loaded.')}</span>
          <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => load()}>
            Try again
          </Button>
        </div>
      ) : sessions.length ? (
        <ul className={styles.sessionList}>
          {sessions.map((session) => {
            const agent = describeAgent(session.userAgent);
            const DeviceIcon = agent.mobile ? Smartphone : Laptop;
            return (
              <li key={session.id} className={styles.sessionRow}>
                <span className={styles.sessionIcon}>
                  <DeviceIcon size={17} />
                </span>
                <span className={styles.sessionText}>
                  <span className={styles.sessionTitle}>
                    {agent.label}
                    {session.current ? <em>This device</em> : null}
                  </span>
                  <span className={styles.sessionMeta}>
                    Active {formatRelative(session.lastUsedAt ?? session.createdAt)}
                  </span>
                </span>
                {session.current ? (
                  <span className={styles.currentPill}>
                    <Check size={11} /> Current
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={revoking === session.id}
                    onClick={() => revoke(session)}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          compact
          icon={Smartphone}
          title="No other sessions"
          description="You are only signed in on this device."
        />
      )}
    </div>
  );
}

function SecurityPanel() {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mode: 'onBlur',
  });

  const newPassword = watch('newPassword');

  const submit = async (values) => {
    try {
      await api.post('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password updated. Other sessions have been signed out.');
    } catch (error) {
      const details = getErrorDetails(error);
      if (!mapServerErrors(details, setError, ['currentPassword', 'newPassword'])) {
        toast.error(getErrorMessage(error, 'Your password could not be changed.'));
      }
    }
  };

  return (
    <Section
      title="Security"
      description="Keep your account protected and see where you are signed in."
    >
      <Card className={styles.panel}>
        <div className={styles.blockHead}>
          <strong>Change password</strong>
          <span>Use at least 8 characters with a letter and a number.</span>
        </div>

        <form className={styles.form} onSubmit={handleSubmit(submit)}>
          <SecretField
            label="Current password"
            autoComplete="current-password"
            error={errors.currentPassword?.message}
            {...register('currentPassword', { required: 'Enter your current password.' })}
          />
          <div className={styles.fieldGrid}>
            <SecretField
              label="New password"
              autoComplete="new-password"
              error={errors.newPassword?.message}
              {...register('newPassword', {
                required: 'Choose a new password.',
                minLength: { value: 8, message: 'Use at least 8 characters.' },
                validate: {
                  letter: (value) => /[a-zA-Z]/.test(value) || 'Include at least one letter.',
                  number: (value) => /[0-9]/.test(value) || 'Include at least one number.',
                  different: (value) =>
                    value !== watch('currentPassword') ||
                    'Choose a password you have not used here before.',
                },
              })}
            />
            <SecretField
              label="Confirm new password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword', {
                required: 'Confirm your new password.',
                validate: (value) => value === newPassword || 'The two passwords do not match.',
              })}
            />
          </div>

          <div className={styles.formFoot}>
            <span className={styles.formHint}>
              Other sessions will be signed out after a password change. This device stays signed
              in.
            </span>
            <Button type="submit" icon={KeyRound} loading={isSubmitting}>
              Update password
            </Button>
          </div>
        </form>

        <hr className={styles.rule} />

        <SessionsCard />
      </Card>
    </Section>
  );
}

/* Account ---------------------------------------------------------------- */

function AccountPanel() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const close = () => {
    if (busy) return;
    setOpen(false);
    setPassword('');
    setError('');
  };

  const remove = async (event) => {
    event.preventDefault();
    if (!password.trim()) {
      setError('Enter your password to confirm.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.delete('/auth/account', { data: { password } });
      setOpen(false);
      await logout();
      navigate('/', { replace: true });
      toast.success('Your account has been deleted.');
    } catch (err) {
      const details = getErrorDetails(err);
      if (Array.isArray(details) && details.some((detail) => detail.path === 'password')) {
        setError(details.find((detail) => detail.path === 'password').message);
      } else {
        setError(getErrorMessage(err, 'Your account could not be deleted.'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Account" description="The last word on your DuoConnect account.">
      <Card className={cn(styles.panel, styles.dangerPanel)}>
        <div className={styles.dangerRow}>
          <span className={styles.dangerIcon}>
            <Trash2 size={19} />
          </span>
          <div className={styles.dangerText}>
            <strong>Delete account</strong>
            <p>
              Your profile and conversations will be closed. This action cannot be undone from the
              app.
            </p>
          </div>
          <Button variant="danger" icon={Trash2} onClick={() => setOpen(true)}>
            Delete account
          </Button>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={close}
        title="Delete your account?"
        description="This permanently closes your profile and removes your access to DuoConnect."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Keep my account
            </Button>
            <Button variant="danger" loading={busy} onClick={remove}>
              Delete permanently
            </Button>
          </>
        }
      >
        <form className={styles.form} onSubmit={remove}>
          <p className={styles.panelNote}>
            Your conversations will no longer be reachable. If you are sure, confirm with your
            password.
          </p>
          <SecretField
            label="Confirm your password"
            autoComplete="current-password"
            value={password}
            error={error}
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) setError('');
            }}
          />
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </Modal>
    </Section>
  );
}

/* Page ------------------------------------------------------------------- */

export default function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((state) => state.logout);
  const reduceMotion = useUiStore((state) => state.reduceMotion);
  const [active, setActive] = useState('profile');
  const anchors = useRef({});

  const scrollTo = useCallback(
    (id) => {
      setActive(id);
      anchors.current[id]?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    },
    [reduceMotion],
  );

  useEffect(() => {
    const id = location.hash.replace('#', '');
    if (!SECTIONS.some((section) => section.id === id)) return undefined;
    const timer = setTimeout(() => scrollTo(id), 80);
    return () => clearTimeout(timer);
  }, [location.hash, scrollTo]);

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
    toast.success('Signed out.');
  };

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Your account"
        icon={SlidersHorizontal}
        title="Settings"
        description="Tune your profile, appearance, and the way DuoConnect reaches you."
        actions={
          <>
            <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/app')}>
              Back to app
            </Button>
            <Button variant="secondary" icon={LogOut} onClick={signOut}>
              Sign out
            </Button>
          </>
        }
      />

      <ScreenBody>
        <div className={styles.layout}>
          <aside className={styles.nav} aria-label="Settings sections">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  className={cn(styles.navItem, active === section.id && styles.navItemActive)}
                  aria-current={active === section.id ? 'true' : undefined}
                  onClick={() => scrollTo(section.id)}
                >
                  <Icon size={16} />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </aside>

          <div className={styles.panels}>
            <div
              id="settings-profile"
              className={styles.anchor}
              ref={(node) => {
                anchors.current.profile = node;
              }}
            >
              <ProfilePanel />
            </div>
            <div
              id="settings-appearance"
              className={styles.anchor}
              ref={(node) => {
                anchors.current.appearance = node;
              }}
            >
              <AppearancePanel />
            </div>
            <div
              id="settings-notifications"
              className={styles.anchor}
              ref={(node) => {
                anchors.current.notifications = node;
              }}
            >
              <NotificationsPanel />
            </div>
            <div
              id="settings-privacy"
              className={styles.anchor}
              ref={(node) => {
                anchors.current.privacy = node;
              }}
            >
              <PrivacyPanel />
            </div>
            <div
              id="settings-security"
              className={styles.anchor}
              ref={(node) => {
                anchors.current.security = node;
              }}
            >
              <SecurityPanel />
            </div>
            <div
              id="settings-account"
              className={styles.anchor}
              ref={(node) => {
                anchors.current.account = node;
              }}
            >
              <AccountPanel />
            </div>
          </div>
        </div>
      </ScreenBody>
    </Screen>
  );
}

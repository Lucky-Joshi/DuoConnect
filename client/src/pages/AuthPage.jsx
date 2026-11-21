import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Logo, Spinner, TextField } from '../components/ui/Primitives';
import { api } from '../lib/api';
import { usernameCheckStatus } from '../lib/usernameCheck';
import { useAuthStore } from '../stores/authStore';
import { getErrorDetails, getErrorMessage } from '../lib/utils';
import styles from './AuthPage.module.css';

const DEFAULTS = {
  identifier: '',
  displayName: '',
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  remember: false,
};

const BENEFITS = [
  'Messages, voice notes, and calls in one calm thread',
  'Delivered and seen receipts you can trust',
  'Private by design — only your connections reach you',
];

function PasswordField({ label, error, reveal, onToggle, ...rest }) {
  return (
    <TextField
      label={label}
      type={reveal ? 'text' : 'password'}
      icon={Lock}
      error={error}
      autoComplete={rest.name === 'confirmPassword' ? 'new-password' : 'current-password'}
      trailing={
        <button
          type="button"
          className={styles.reveal}
          onClick={onToggle}
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

export default function AuthPage({ mode = 'login' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const login = useAuthStore((state) => state.login);
  const registerUser = useAuthStore((state) => state.register);

  const isLogin = mode === 'login';
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: DEFAULTS, mode: 'onBlur' });

  const password = watch('password');
  const username = watch('username');
  const [usernameCheck, setUsernameCheck] = useState({ state: 'idle', message: '' });

  useEffect(() => {
    if (isLogin) return undefined;

    const normalized = (username ?? '').trim().toLowerCase();
    if (!normalized) {
      setUsernameCheck({ state: 'idle', message: '' });
      return undefined;
    }
    if (normalized.length < 3) {
      setUsernameCheck({ state: 'invalid', message: 'At least 3 characters.' });
      return undefined;
    }

    const controller = new AbortController();
    setUsernameCheck({ state: 'checking', message: 'Checking…' });
    const timer = setTimeout(async () => {
      try {
        const response = await api.get('/auth/username-available', {
          params: { username: normalized },
          signal: controller.signal,
        });
        setUsernameCheck(usernameCheckStatus(response));
      } catch (error) {
        if (error?.name !== 'CanceledError' && error?.code !== 'ERR_CANCELED') {
          // A failed check must never block registration; the server still
          // enforces uniqueness when the account is created.
          setUsernameCheck({ state: 'idle', message: '' });
        }
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [username, isLogin]);

  useEffect(() => {
    reset(DEFAULTS);
    setShowPassword(false);
    setShowConfirm(false);
  }, [mode, reset]);

  const redirectTo = isLogin && location.state?.from ? location.state.from : '/app';

  if (status === 'authenticated') return <Navigate to={redirectTo} replace />;

  const onSubmit = async (values) => {
    if (!isLogin && usernameCheck.state === 'taken') {
      setError('username', { type: 'server', message: 'That username is taken.' });
      toast.error('That username is taken. Choose another one.');
      return;
    }
    if (!isLogin && usernameCheck.state === 'checking') {
      toast.error('Still checking that username. Try again in a moment.');
      return;
    }

    try {
      if (isLogin) {
        await login({
          identifier: values.identifier.trim(),
          password: values.password,
          remember: values.remember,
        });
        toast.success('Welcome back.');
      } else {
        await registerUser({
          displayName: values.displayName.trim(),
          username: values.username.trim().toLowerCase(),
          email: values.email.trim(),
          password: values.password,
          remember: values.remember,
        });
        toast.success('Your account is ready.');
      }
      navigate(redirectTo, { replace: true });
    } catch (error) {
      const details = getErrorDetails(error);
      if (Array.isArray(details)) {
        for (const detail of details) {
          if (detail?.path && Object.hasOwn(DEFAULTS, detail.path)) {
            setError(detail.path, { type: 'server', message: detail.message });
          }
        }
      }
      const code = error?.response?.data?.error?.code;
      if (code === 'USERNAME_TAKEN') {
        setError('username', { type: 'server', message: 'That username is taken.' });
        setUsernameCheck({ state: 'taken', message: 'That username is taken.' });
      }
      if (code === 'INVALID_CREDENTIALS') {
        setError('password', {
          type: 'server',
          message: 'That password does not match this account.',
        });
      }
      toast.error(
        getErrorMessage(
          error,
          isLogin ? 'Could not sign you in.' : 'Could not create your account.',
        ),
      );
    }
  };

  const switchPath = isLogin ? '/register' : '/login';

  return (
    <div className={styles.page}>
      <div className={styles.aurora} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <header className={styles.nav}>
        <Link to="/" className={styles.brand}>
          <Logo size={32} />
          <span>
            Duo<em>Connect</em>
          </span>
        </Link>
        <div className={styles.navSwitch}>
          <span>{isLogin ? 'New to DuoConnect?' : 'Already have an account?'}</span>
          <Button size="sm" variant="ghost" onClick={() => navigate(switchPath)}>
            {isLogin ? 'Create account' : 'Sign in'}
          </Button>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.story} aria-hidden="true">
          <div>
            <span className={styles.eyebrow}>
              <Sparkles size={13} /> {isLogin ? 'Your space is waiting' : 'A calmer way to connect'}
            </span>
            <h1>
              {isLogin ? 'Come back to' : 'Bring your people'}
              <span className="serif"> {isLogin ? 'your people' : 'together'}</span>
            </h1>
            <p className={styles.lead}>
              {isLogin
                ? 'Pick up the conversation exactly where you left it — messages, voice notes, and calls all in one quiet place.'
                : 'One private home for the people who matter. Start with a message, stay for the voice notes and late-night calls.'}
            </p>
            <ul className={styles.benefits}>
              {BENEFITS.map((item) => (
                <li key={item}>
                  <Check size={14} />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.preview}>
            <div className={styles.previewGlow} />
            <div className={styles.previewCard}>
              <div className={styles.previewTop}>
                <span className={styles.previewLabel}>Private by design</span>
                <span className={styles.previewCount}>Yours alone</span>
              </div>
              <figure className={styles.quote}>
                <blockquote>“Everything you need to stay close, without the noise.”</blockquote>
                <figcaption>Built for real conversations</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.card}>
            <header className={styles.cardHead}>
              <span className={styles.cardEyebrow}>
                {isLogin ? <Lock size={13} /> : <Sparkles size={13} />}
                {isLogin ? 'Secure sign in' : 'Create your account'}
              </span>
              <h2>{isLogin ? 'Welcome back' : 'Make yourself at home'}</h2>
              <p>
                {isLogin
                  ? 'Use your email or username to continue.'
                  : 'A few details and your space is ready.'}
              </p>
            </header>

            <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
              {isLogin ? (
                <TextField
                  label="Email or username"
                  icon={UserRound}
                  placeholder="you or you@example.com"
                  autoComplete="username"
                  autoFocus
                  error={errors.identifier?.message}
                  {...register('identifier', {
                    required: 'Enter your email or username.',
                    maxLength: { value: 254, message: 'That is a little too long.' },
                  })}
                />
              ) : (
                <>
                  <div className={styles.fieldGrid}>
                    <TextField
                      label="Display name"
                      icon={UserRound}
                      placeholder="Your name"
                      autoComplete="name"
                      autoFocus
                      error={errors.displayName?.message}
                      {...register('displayName', {
                        required: 'Add a display name.',
                        maxLength: { value: 40, message: 'Keep it under 40 characters.' },
                      })}
                    />
                    <TextField
                      label="Username"
                      icon={AtSign}
                      placeholder="yourname"
                      autoComplete="username"
                      hint="Letters, numbers, dots"
                      error={errors.username?.message}
                      trailing={
                        usernameCheck.state === 'idle' ? null : (
                          <span
                            className={`${styles.usernameStatus} ${
                              styles[`username_${usernameCheck.state}`] ?? ''
                            }`}
                            role="status"
                            aria-live="polite"
                          >
                            {usernameCheck.state === 'checking' ? (
                              <Spinner size={14} />
                            ) : usernameCheck.state === 'available' ? (
                              <Check size={15} />
                            ) : (
                              <X size={15} />
                            )}
                            {usernameCheck.state === 'checking' ? null : (
                              <span>
                                {usernameCheck.state === 'available'
                                  ? 'Available'
                                  : usernameCheck.state === 'taken'
                                    ? 'Taken'
                                    : 'Invalid'}
                              </span>
                            )}
                          </span>
                        )
                      }
                      {...register('username', {
                        required: 'Choose a username.',
                        minLength: { value: 3, message: 'At least 3 characters.' },
                        maxLength: { value: 24, message: 'At most 24 characters.' },
                        pattern: {
                          value: /^[a-zA-Z0-9][a-zA-Z0-9._]*[a-zA-Z0-9]$/,
                          message: 'Start and end with a letter or number.',
                        },
                      })}
                    />
                  </div>
                  <TextField
                    label="Email address"
                    icon={Mail}
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    error={errors.email?.message}
                    {...register('email', {
                      required: 'Enter your email address.',
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
                        message: 'Enter a valid email address.',
                      },
                    })}
                  />
                </>
              )}

              <PasswordField
                label="Password"
                name="password"
                placeholder={isLogin ? 'Your password' : 'At least 8 characters'}
                reveal={showPassword}
                error={errors.password?.message}
                onToggle={() => setShowPassword((value) => !value)}
                {...register('password', {
                  required: 'Enter your password.',
                  ...(isLogin
                    ? {}
                    : {
                        minLength: { value: 8, message: 'Use at least 8 characters.' },
                        maxLength: { value: 72, message: 'At most 72 characters.' },
                        validate: (value) =>
                          (/[a-zA-Z]/.test(value) && /[0-9]/.test(value)) ||
                          'Include at least one letter and one number.',
                      }),
                })}
              />

              {!isLogin ? (
                <PasswordField
                  label="Confirm password"
                  name="confirmPassword"
                  placeholder="Repeat your password"
                  reveal={showConfirm}
                  error={errors.confirmPassword?.message}
                  onToggle={() => setShowConfirm((value) => !value)}
                  {...register('confirmPassword', {
                    required: 'Repeat your password.',
                    validate: (value) => value === password || 'Passwords do not match yet.',
                  })}
                />
              ) : null}

              <label className={styles.remember}>
                <input type="checkbox" {...register('remember')} />
                <span className={styles.checkbox} aria-hidden="true">
                  <Check size={12} />
                </span>
                <span>
                  Keep me signed in
                  <small>Stay signed in on this device for longer.</small>
                </span>
              </label>

              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={isSubmitting}
                icon={isLogin ? ArrowRight : Sparkles}
              >
                {isLogin ? 'Sign in' : 'Create account'}
              </Button>
            </form>

            <p className={styles.switchLine}>
              {isLogin ? 'New here?' : 'Already have an account?'}{' '}
              <button type="button" onClick={() => navigate(switchPath)}>
                {isLogin ? 'Create an account' : 'Sign in instead'}
              </button>
            </p>
          </div>

          <p className={styles.security}>
            <ShieldCheck size={14} />
            Protected by rotating refresh tokens and a private, cookie-based session.
          </p>

          <button type="button" className={styles.backHome} onClick={() => navigate('/')}>
            <ArrowLeft size={14} /> Back to home
          </button>
        </section>
      </main>
    </div>
  );
}

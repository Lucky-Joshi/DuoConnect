import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Bell,
  LogOut,
  MessageCircle,
  Moon,
  Phone,
  Settings,
  Sun,
  UserRound,
  Users,
} from 'lucide-react';
import { Avatar, Badge, IconButton, Logo } from '../ui/Primitives';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { useFriendsStore } from '../../stores/friendsStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { cn } from '../../lib/utils';
import styles from './Rail.module.css';

function RailLink({ to, label, icon: Icon, badge, active, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={cn(styles.link, active && styles.linkActive)}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      <span className={styles.iconWrap}>
        <Icon size={21} strokeWidth={active ? 2.15 : 1.85} />
        {badge ? <Badge count={badge} className={styles.linkBadge} /> : null}
      </span>
      <span className={styles.linkLabel}>{label}</span>
      <span className={styles.tip}>{label}</span>
    </NavLink>
  );
}

export function Rail() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const settings = useAuthStore((state) => state.settings);
  const updateSettings = useAuthStore((state) => state.updateSettings);
  const logout = useAuthStore((state) => state.logout);

  const chats = useChatStore((state) => state.chats);
  const incoming = useFriendsStore((state) => state.incoming);
  const unreadNotifications = useNotificationStore((state) => state.unread);

  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = settings?.theme === 'dark' || (settings?.theme !== 'light' && systemDark);
  const totalUnread = chats.reduce((sum, chat) => sum + (Number(chat.unread) || 0), 0);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useClickOutside(() => setMenuOpen(false), menuOpen);

  const path = location.pathname;
  const isChats = path === '/app' || path.startsWith('/app/c/');
  const isFriends = path.startsWith('/app/friends') || path.startsWith('/app/u/');
  const isCalls = path.startsWith('/app/calls');
  const isNotifications = path.startsWith('/app/notifications');
  const isSettings = path.startsWith('/app/settings');

  const toggleTheme = async () => {
    try {
      await updateSettings({ theme: dark ? 'light' : 'dark' });
    } catch {
      toast.error('Could not change the theme.');
    }
  };

  const signOut = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav className={styles.rail} aria-label="Primary navigation">
      <NavLink to="/app" className={styles.logo} aria-label="DuoConnect">
        <Logo size={32} />
      </NavLink>

      <span className={styles.rule} />

      <div className={styles.links}>
        <RailLink
          to="/app"
          label="Chats"
          icon={MessageCircle}
          badge={totalUnread}
          active={isChats}
        />
        <RailLink
          to="/app/friends"
          label="People"
          icon={Users}
          badge={incoming.length}
          active={isFriends}
        />
        <RailLink to="/app/calls" label="Calls" icon={Phone} active={isCalls} />
        <RailLink
          to="/app/notifications"
          label="Activity"
          icon={Bell}
          badge={unreadNotifications}
          active={isNotifications}
        />
        <RailLink to="/app/settings" label="Settings" icon={Settings} active={isSettings} />
      </div>

      <div className={styles.bottom}>
        <IconButton
          label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggleTheme}
          className={styles.themeButton}
        >
          {dark ? <Sun size={19} /> : <Moon size={19} />}
        </IconButton>

        <div className={styles.user} ref={menuRef}>
          <button
            type="button"
            className={cn(styles.avatarButton, menuOpen && styles.avatarButtonOpen)}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Account menu"
            aria-expanded={menuOpen}
          >
            <Avatar user={user} size="sm" showStatus status={user?.status} />
          </button>

          {menuOpen ? (
            <div className={styles.menu} role="menu">
              <div className={styles.menuHead}>
                <Avatar user={user} size="md" showStatus status={user?.status} />
                <div className={styles.menuIdentity}>
                  <strong>{user?.displayName}</strong>
                  <span>@{user?.username}</span>
                </div>
              </div>
              <div className={styles.menuLinks}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(`/app/u/${user?.username}`);
                  }}
                >
                  <UserRound size={16} /> View profile
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/app/settings');
                  }}
                >
                  <Settings size={16} /> Settings
                </button>
                <button type="button" role="menuitem" onClick={signOut} className={styles.signOut}>
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

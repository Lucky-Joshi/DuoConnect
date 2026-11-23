export const APP_NAME = 'DuoConnect';

export const MESSAGE_PAGE_SIZE = 40;
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_FILE_MB = 10;
export const MAX_AVATAR_MB = 5;

export const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

function parseIceServers() {
  const raw = import.meta.env.VITE_ICE_SERVERS;
  if (!raw) return DEFAULT_ICE_SERVERS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_ICE_SERVERS;
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
}

export const ICE_SERVERS = parseIceServers();

export const THEMES = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'System', icon: 'monitor' },
];

export const ACCENTS = [
  { id: 'violet', label: 'Violet', colors: ['#a78bfa', '#22d3ee'] },
  { id: 'aqua', label: 'Aqua', colors: ['#67e8f9', '#818cf8'] },
  { id: 'coral', label: 'Coral', colors: ['#fda4af', '#fbbf24'] },
  { id: 'amber', label: 'Amber', colors: ['#fcd34d', '#fb7185'] },
  { id: 'rose', label: 'Rose', colors: ['#f0abfc', '#818cf8'] },
];

export const WALLPAPERS = [
  { id: 'aurora', label: 'Aurora' },
  { id: 'mesh', label: 'Mesh' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'minimal', label: 'Minimal' },
];

export const PRESENCE_VISIBILITY = [
  { id: 'everyone', label: 'Everyone' },
  { id: 'friends', label: 'Friends' },
  { id: 'nobody', label: 'Nobody' },
];

export const MESSAGE_TYPES = ['text', 'image', 'file', 'voice', 'sticker', 'gif', 'game'];

export const TYPING_IDLE_MS = 2400;
export const TYPING_REFRESH_MS = 1800;

export const CALL_STATUS = {
  IDLE: 'idle',
  OUTGOING: 'outgoing',
  INCOMING: 'incoming',
  CONNECTING: 'connecting',
  ONGOING: 'ongoing',
  ENDED: 'ended',
};

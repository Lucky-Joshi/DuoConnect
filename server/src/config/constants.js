export const MESSAGE_PAGE_SIZE = 40;
export const MAX_MESSAGE_LENGTH = 4000;
export const CALL_RING_TIMEOUT_MS = 45_000;
export const TYPING_TTL_MS = 4_000;
export const ONLINE_STATUSES = new Set(['online', 'away']);

export const CHAT_KINDS = ['direct', 'group'];
export const MESSAGE_TYPES = ['text', 'image', 'file', 'voice', 'system'];
export const CALL_STATUSES = [
  'ringing',
  'ongoing',
  'completed',
  'missed',
  'declined',
  'cancelled',
  'failed',
];

export const NOTIFICATION_TYPES = [
  'friend_request',
  'friend_accept',
  'message',
  'missed_call',
  'call_ended',
  'system',
];

export const PRESENCE_VISIBILITY = ['everyone', 'friends', 'nobody'];
export const THEMES = ['light', 'dark', 'system'];
export const ACCENTS = ['violet', 'aqua', 'coral', 'amber', 'rose'];

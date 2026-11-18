import { conflict, notFound } from '../../utils/errors.js';
import { mapPublicUser, mapSettings } from '../../utils/serialize.js';
import { normalizeUsername } from '../../utils/sanitize.js';
import * as repo from './users.repository.js';
import { findUserById } from '../auth/auth.repository.js';

export async function getProfile(username, viewerId) {
  const row = await repo.getProfileByUsername(username, viewerId);
  if (!row) throw notFound('We could not find that person.');

  const isSelf = row.id === viewerId;
  const relation = {
    isSelf,
    isFriend: Boolean(row.friends_since),
    friendsSince: row.friends_since ?? null,
    request: isSelf
      ? null
      : row.request_id
        ? {
            id: row.request_id,
            direction: row.request_sender === viewerId ? 'outgoing' : 'incoming',
          }
        : null,
    blockedByMe: Boolean(row.blocked_by_me),
    blockedMe: Boolean(row.blocked_me),
  };

  const user = mapPublicUser(row, {
    viewerId,
    viewerIsFriend: relation.isFriend || isSelf,
  });

  return { user, relation };
}

export async function search(viewerId, { q, limit }) {
  const rows = await repo.searchUsers({ q, viewerId, limit });
  return rows.map((row) => ({
    user: mapPublicUser(row, {
      viewerId,
      viewerIsFriend: Boolean(row.is_friend),
    }),
    relation: {
      isSelf: false,
      isFriend: Boolean(row.is_friend),
      request: row.request_id
        ? {
            id: row.request_id,
            direction: row.request_sender === viewerId ? 'outgoing' : 'incoming',
          }
        : null,
      blockedByMe: false,
      blockedMe: false,
    },
  }));
}

export async function updateProfile(userId, input) {
  const fields = {};
  if (input.displayName !== undefined) fields.display_name = input.displayName.trim();
  if (input.username !== undefined) fields.username = normalizeUsername(input.username);
  if (input.about !== undefined) fields.about = input.about.trim();
  if (input.avatarUrl !== undefined) fields.avatar_url = input.avatarUrl || null;

  let updated;
  try {
    updated = await repo.updateProfile(userId, fields);
  } catch (error) {
    if (error.code === '23505') {
      throw conflict('That username is already taken.', 'USERNAME_TAKEN');
    }
    throw error;
  }

  if (!updated) throw notFound('Account not found.');
  const full = await findUserById(userId);
  return {
    user: mapPublicUser(full, { viewerId: userId }),
    settings: mapSettings(full),
  };
}

const SETTINGS_COLUMNS = {
  theme: 'theme',
  accent: 'accent',
  wallpaper: 'wallpaper',
  messages: 'message_notifications',
  friendRequests: 'friend_request_notifications',
  calls: 'call_notifications',
  sounds: 'sound_enabled',
  desktop: 'desktop_notifications',
  readReceipts: 'read_receipts',
  presence: 'presence_visibility',
  lastSeen: 'last_seen_visibility',
};

export async function updateSettings(userId, input) {
  const fields = {};
  for (const key of ['theme', 'accent', 'wallpaper']) {
    if (input[key] !== undefined) fields[SETTINGS_COLUMNS[key]] = input[key];
  }
  if (input.notifications) {
    for (const key of ['messages', 'friendRequests', 'calls', 'sounds', 'desktop']) {
      if (input.notifications[key] !== undefined) {
        fields[SETTINGS_COLUMNS[key]] = input.notifications[key];
      }
    }
  }
  if (input.privacy) {
    for (const key of ['readReceipts', 'presence', 'lastSeen']) {
      if (input.privacy[key] !== undefined) {
        fields[SETTINGS_COLUMNS[key]] = input.privacy[key];
      }
    }
  }

  const row = await repo.updateSettings(userId, fields);
  return mapSettings(row);
}

export async function setAvatar(userId, avatarUrl) {
  const updated = await repo.updateProfile(userId, { avatar_url: avatarUrl });
  if (!updated) throw notFound('Account not found.');
  return mapPublicUser(updated, { viewerId: userId });
}

import { mapNotification } from '../../utils/serialize.js';
import { emitToUser } from '../../realtime/events.js';
import * as repo from './notifications.repository.js';
import * as push from './push.service.js';

const SETTING_BY_TYPE = {
  friend_request: 'friend_request_notifications',
  friend_accept: 'friend_request_notifications',
  message: 'message_notifications',
  missed_call: 'call_notifications',
  call_ended: 'call_notifications',
  system: null,
};

function destinationFor(type, chatId) {
  if (chatId) return `/app/c/${chatId}`;
  if (type === 'friend_request' || type === 'friend_accept') return '/app/friends?tab=requests';
  if (type === 'missed_call' || type === 'call_ended') return '/app/calls';
  return '/app/notifications';
}

export async function notify({
  userId,
  actorId = null,
  type,
  chatId = null,
  callId = null,
  payload = {},
  respectSettings = true,
}) {
  if (respectSettings) {
    const settingColumn = SETTING_BY_TYPE[type];
    if (settingColumn) {
      const settings = await repo.getNotificationSettings(userId);
      if (settings && settings[settingColumn] === false) return null;
    }
  }

  const row = await repo.insertNotification({ userId, actorId, type, chatId, callId, payload });
  const actor = await repo.findActor(actorId);
  const notification = mapNotification(row, actor);
  emitToUser(userId, 'notification:new', notification);

  await push.sendToUser(
    userId,
    {
      type,
      title: payload.title ?? 'New activity on DuoConnect',
      body: payload.body ?? '',
      url: destinationFor(type, chatId),
      tag: notification.id,
      icon: '/icon-192.png',
    },
    { ttl: type === 'message' ? 86_400 : 43_200 },
  );
  return notification;
}

export async function list(userId, options) {
  const rows = await repo.listNotifications(userId, options);
  return rows.map((row) =>
    mapNotification(row, {
      id: row.actor_id,
      username: row.actor_username,
      display_name: row.actor_display_name,
      avatar_url: row.actor_avatar_url,
    }),
  );
}

export async function summary(userId) {
  const count = await repo.unreadCount(userId);
  return { unread: count };
}

export async function markRead(userId, notificationId) {
  const row = await repo.markRead(userId, notificationId);
  if (!row) return { success: true };
  const count = await repo.unreadCount(userId);
  emitToUser(userId, 'notification:read', { id: notificationId, unread: count });
  return { success: true, unread: count };
}

export async function markAllRead(userId) {
  await repo.markAllRead(userId);
  emitToUser(userId, 'notification:read-all', { unread: 0 });
  return { success: true, unread: 0 };
}

export async function remove(userId, notificationId) {
  const deleted = await repo.deleteNotification(userId, notificationId);
  return { success: deleted };
}

export async function clearRead(userId) {
  const deleted = await repo.clearRead(userId);
  return { success: true, deleted };
}

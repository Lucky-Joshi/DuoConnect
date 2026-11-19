import { conflict } from '../../utils/errors.js';
import { deliverPush, pushEnabled, vapidPublicKey } from '../../config/push.js';
import { activeUserIds } from '../../realtime/presence.js';
import * as repo from './push.repository.js';

export function publicKey() {
  return { publicKey: vapidPublicKey, enabled: pushEnabled };
}

export async function subscribe(userId, { endpoint, keys }) {
  const stored = await repo.upsert({
    userId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });
  if (!stored) {
    throw conflict('That push subscription belongs to another account.', 'SUBSCRIPTION_CONFLICT');
  }
  return { ...stored, enabled: pushEnabled };
}

export async function unsubscribe(userId, endpoint) {
  return { success: await repo.remove(userId, endpoint) };
}

export async function sendTest(userId) {
  const sent = await sendToUser(
    userId,
    {
      type: 'system',
      title: 'DuoConnect test',
      body: 'Push notifications are working.',
      url: '/app/notifications',
      tag: 'push-test',
      icon: '/icon-192.png',
    },
    { force: true, ttl: 60 },
  );
  return { enabled: pushEnabled, sent };
}

/**
 * Deliver a background notification to every browser registered for this user.
 * Online users are skipped: the open tab already shows toasts and notifications.
 */
export async function sendToUser(userId, payload, { force = false, ttl = 43_200 } = {}) {
  if (!pushEnabled) return 0;
  if (!force && activeUserIds().includes(userId)) return 0;

  const subscriptions = await repo.listByUser(userId);
  if (!subscriptions.length) return 0;

  const topic = (payload.tag || 'duoconnect').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  const results = await Promise.all(
    subscriptions.map((subscription) =>
      deliverPush(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
        { TTL: ttl, topic, urgency: payload.type === 'incoming_call' ? 'high' : 'normal' },
      ),
    ),
  );

  await Promise.all(
    results
      .map((result, index) => (result === 'gone' ? subscriptions[index].id : null))
      .filter(Boolean)
      .map((id) => repo.removeById(id)),
  );

  return results.filter((result) => result === 'sent').length;
}

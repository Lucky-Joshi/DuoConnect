import { sendNotification, setVapidDetails } from 'web-push';
import { logger } from './logger.js';
import { env } from './env.js';

let enabled = false;

if (env.vapidEnabled) {
  try {
    setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
    enabled = true;
  } catch (error) {
    logger.error({ err: error }, 'Invalid VAPID configuration — Web Push is disabled');
  }
}

export const pushEnabled = enabled;
export const vapidPublicKey = env.vapidPublicKey;

/**
 * @returns {'sent'|'gone'|'failed'|'disabled'}
 */
export async function deliverPush(subscription, payload, options = {}) {
  if (!enabled) return 'disabled';
  try {
    await sendNotification(subscription, JSON.stringify(payload), options);
    return 'sent';
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) return 'gone';
    logger.warn({ err: error, endpoint: subscription.endpoint }, 'Web Push delivery failed');
    return 'failed';
  }
}

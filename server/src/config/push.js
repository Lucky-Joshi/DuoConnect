import { sendNotification, setVapidDetails } from 'web-push';
import { logger } from './logger.js';
import { env } from './env.js';

let enabled = false;
let initializationError = null;

if (!env.vapidEnabled) {
  logger.warn(
    'Web Push disabled — VAPID_SUBJECT, VAPID_PUBLIC_KEY, and VAPID_PRIVATE_KEY are all required',
  );
} else {
  try {
    setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
    enabled = true;
  } catch (error) {
    initializationError = error?.message || 'Unknown VAPID configuration error';
    logger.error({ err: error }, 'Invalid VAPID configuration — Web Push is disabled');
  }
}

export const pushEnabled = enabled;
export const vapidPublicKey = env.vapidPublicKey;
export const pushDiagnostics = {
  enabled,
  subjectConfigured: Boolean(env.vapidSubject),
  publicKeyConfigured: Boolean(env.vapidPublicKey),
  privateKeyConfigured: Boolean(env.vapidPrivateKey),
  error: initializationError,
};

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

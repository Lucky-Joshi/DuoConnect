import { api } from './api';

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim();
const SW_URL = '/sw.js';

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(VAPID_PUBLIC_KEY)
  );
}

export function pushPermission() {
  return typeof window !== 'undefined' && 'Notification' in window
    ? window.Notification.permission
    : 'denied';
}

function applicationServerKey() {
  const padding = '='.repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4);
  const base64 = `${VAPID_PUBLIC_KEY}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export async function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  } catch {
    return null;
  }
}

async function registration() {
  return registerServiceWorker();
}

function serialize(subscription) {
  const keys = subscription.toJSON().keys;
  return { endpoint: subscription.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

async function ensureSubscription() {
  const current = await registration();
  let subscription = await current.pushManager.getSubscription();
  if (!subscription) {
    subscription = await current.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(),
    });
  }
  return subscription;
}

/** Ask for permission, subscribe this browser, and register it with the API. */
export async function enablePush() {
  if (!pushSupported()) {
    throw new Error('Push notifications are not available in this browser.');
  }
  let permission = pushPermission();
  if (permission === 'default') permission = await window.Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted. Allow it in your browser settings.');
  }
  const subscription = await ensureSubscription();
  await api.post('/notifications/push/subscribe', serialize(subscription));
  return subscription;
}

/** Remove this browser's subscription locally and on the server. */
export async function disablePush() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const current = await navigator.serviceWorker.getRegistration();
  const subscription = await current?.pushManager?.getSubscription();
  if (!subscription) return;
  await api
    .delete('/notifications/push/unsubscribe', { data: { endpoint: subscription.endpoint } })
    .catch(() => {});
  await subscription.unsubscribe();
}

/** Re-register an existing subscription after a browser refresh or key rotation. */
export async function syncPushSubscription() {
  if (!pushSupported() || pushPermission() !== 'granted') return false;
  try {
    const subscription = await ensureSubscription();
    await api.post('/notifications/push/subscribe', serialize(subscription));
    return true;
  } catch {
    return false;
  }
}

/** Ask the server to deliver a test push to this browser. */
export async function sendTestPush() {
  return api.post('/notifications/push/test');
}

/** True only when this browser already has an active push subscription. */
export async function hasPushSubscription() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const current = await navigator.serviceWorker.getRegistration();
    return Boolean(await current?.pushManager?.getSubscription());
  } catch {
    return false;
  }
}

const DEFAULT_URL = '/app';
const DEFAULT_ICON = '/icon-192.png';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function notificationOptions(payload) {
  const options = {
    body: payload.body || '',
    icon: payload.icon || DEFAULT_ICON,
    badge: DEFAULT_ICON,
    tag: payload.tag || 'duoconnect',
    renotify: Boolean(payload.tag),
    data: { url: payload.url || DEFAULT_URL },
    vibrate: payload.type === 'incoming_call' ? [200, 100, 200, 100, 200] : [100, 50, 100],
  };
  if (payload.type === 'incoming_call') options.requireInteraction = true;
  if (Array.isArray(payload.actions) && payload.actions.length) options.actions = payload.actions;
  return options;
}

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }
  const title = payload.title || 'DuoConnect';
  event.waitUntil(self.registration.showNotification(title, notificationOptions(payload)));
});

async function focusOrOpen(url) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  let target = null;
  for (const client of clients) {
    if (new URL(client.url).origin !== self.location.origin) continue;
    if (!target || client.focused) target = client;
  }
  if (target) {
    await target.focus();
    if ('navigate' in target) await target.navigate(url);
    return;
  }
  await self.clients.openWindow(url);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action;
  let url = event.notification.data?.url || DEFAULT_URL;
  if (action === 'calls' || action === 'decline') url = '/app/calls';
  event.waitUntil(focusOrOpen(url));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: 'duoconnect:push-subscription-changed' });
      }
    }),
  );
});

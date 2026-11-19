import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateVAPIDKeys } from 'web-push';

const keys = generateVAPIDKeys();

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.VAPID_SUBJECT = 'https://duoconnect.test';
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;

test('web push config reads VAPID variables from the environment', async () => {
  const push = await import('../src/config/push.js');

  assert.equal(push.pushEnabled, true);
  assert.equal(push.vapidPublicKey, keys.publicKey);
  assert.equal(push.pushDiagnostics.enabled, true);
  assert.equal(push.pushDiagnostics.subjectConfigured, true);
  assert.equal(push.pushDiagnostics.publicKeyConfigured, true);
  assert.equal(push.pushDiagnostics.privateKeyConfigured, true);
  assert.equal(push.pushDiagnostics.error, null);
});

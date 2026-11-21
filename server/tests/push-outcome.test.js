import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.LOG_LEVEL = 'silent';

const { pushTestError } = await import('../src/modules/notifications/push.service.js');

test('push self-test reports why a test notification could not be delivered', () => {
  assert.equal(
    pushTestError({ enabled: false, subscriptions: 1, sent: 0 }).code,
    'PUSH_NOT_CONFIGURED',
  );

  const missing = pushTestError({ enabled: true, subscriptions: 0, sent: 0 });
  assert.equal(missing.code, 'NO_PUSH_SUBSCRIPTION');
  assert.match(missing.message, /turn on push notifications/i);

  const failed = pushTestError({ enabled: true, subscriptions: 1, sent: 0 });
  assert.equal(failed.code, 'PUSH_DELIVERY_FAILED');
  assert.doesNotMatch(failed.message, /no push subscription/i);

  assert.equal(pushTestError({ enabled: true, subscriptions: 1, sent: 1 }), null);
});

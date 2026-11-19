import { beforeEach, describe, expect, it } from 'vitest';
import { clearOutbox, dequeue, enqueue, listQueued } from './outbox';

const entry = (id, userId = 'u1') => ({
  clientId: id,
  userId,
  chatId: 'c1',
  payload: { body: 'hello' },
  optimistic: { id: `pending:${id}` },
});

describe('message outbox', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and removes queued messages', () => {
    enqueue(entry('a'));
    expect(listQueued().map((item) => item.clientId)).toEqual(['a']);
    dequeue('a');
    expect(listQueued()).toEqual([]);
  });

  it('does not enqueue the same clientId twice', () => {
    enqueue(entry('a'));
    enqueue(entry('a'));
    expect(listQueued()).toHaveLength(1);
  });

  it('scopes queued messages to their account', () => {
    enqueue(entry('a', 'u1'));
    enqueue(entry('b', 'u2'));
    expect(listQueued('u1').map((item) => item.clientId)).toEqual(['a']);
    expect(listQueued('u2').map((item) => item.clientId)).toEqual(['b']);
  });

  it('tolerates corrupted storage', () => {
    localStorage.setItem('duo:message-outbox', 'not json');
    expect(listQueued()).toEqual([]);
    expect(() => enqueue(entry('a'))).not.toThrow();
    expect(listQueued()).toHaveLength(1);
  });

  it('clears the whole outbox', () => {
    enqueue(entry('a'));
    clearOutbox();
    expect(listQueued()).toEqual([]);
  });
});

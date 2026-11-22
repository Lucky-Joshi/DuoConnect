import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { useChatStore } from './chatStore';

describe('chatStore reactions', () => {
  let post;

  beforeEach(() => {
    post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { reactions: [] } } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts to the server reaction route without duplicating the /api prefix', async () => {
    const message = await useChatStore.getState().toggleReaction('message-123', '👍');

    expect(message).toEqual({ reactions: [] });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/messages/message-123/reactions', { emoji: '👍' });

    const requestedPath = post.mock.calls[0][0];
    expect(requestedPath).not.toContain('/api/api/');
  });
});

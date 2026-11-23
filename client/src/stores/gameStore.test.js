import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { useGameStore } from './gameStore';

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upserts active and completed games by chat', () => {
    const active = { id: 'g1', chatId: 'c1', status: 'active', type: 'tictactoe' };
    const completed = { ...active, status: 'completed', result: 'draw' };

    useGameStore.getState().upsertGame(active);
    expect(useGameStore.getState().activeByChat.c1?.id).toBe('g1');

    useGameStore.getState().upsertGame(completed);
    expect(useGameStore.getState().activeByChat.c1).toBeUndefined();
    expect(useGameStore.getState().historyByChat.c1[0].status).toBe('completed');
  });

  it('posts game invites through the API', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { data: { id: 'g2', chatId: 'c1', status: 'invited', type: 'drawguess' } },
    });

    const game = await useGameStore.getState().invite({ chatId: 'c1', type: 'drawguess' });

    expect(post).toHaveBeenCalledWith('/games/invites', { chatId: 'c1', type: 'drawguess' });
    expect(game.id).toBe('g2');
    expect(useGameStore.getState().activeByChat.c1?.id).toBe('g2');
  });
});

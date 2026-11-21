import { describe, expect, it } from 'vitest';
import { conversationParticipant } from './conversation';

const me = { id: 'me', displayName: 'Lucky Joshi', avatarUrl: 'own.jpg' };
const friend = { id: 'friend', displayName: 'Yogita', avatarUrl: 'friend.jpg' };

describe('conversationParticipant', () => {
  it('prefers the server-resolved peer over an arbitrary member', () => {
    expect(conversationParticipant(friend, [me, friend], me.id)).toEqual(friend);
  });

  it('never picks the viewer when only raw members are available', () => {
    // Mirrors the API order: owner first, then display name — "Lucky" < "Yogita".
    expect(conversationParticipant(null, [me, friend], me.id)).toEqual(friend);
  });

  it('falls back to the first member when the viewer is not in the list', () => {
    expect(conversationParticipant(null, [friend], me.id)).toEqual(friend);
    expect(conversationParticipant(null, [], me.id)).toBeNull();
  });
});

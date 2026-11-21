/**
 * The conversation card shows the peer, never the viewer. `members` includes
 * the signed-in user and is ordered by display name, so `members[0]` can be
 * "you" (e.g. "Lucky Joshi" sorts before "Yogita").
 */
export function conversationParticipant(other, members = [], viewerId = null) {
  return (
    other ?? members.find((member) => member?.id && member.id !== viewerId) ?? members[0] ?? null
  );
}

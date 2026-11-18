import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { mapPublicUser } from '../../utils/serialize.js';
import { findUserById } from '../auth/auth.repository.js';
import { areFriends, getBlockState } from '../friends/friends.repository.js';
import * as repo from './chats.repository.js';

function lastMessage(row) {
  if (!row.lm_id) return null;
  const preview = row.lm_deleted_at
    ? 'Message deleted'
    : row.lm_type === 'image'
      ? 'Photo'
      : row.lm_type === 'voice'
        ? 'Voice message'
        : row.lm_type === 'file'
          ? 'Attachment'
          : (row.lm_body || '').slice(0, 160);
  return {
    id: row.lm_id,
    seq: Number(row.lm_seq),
    type: row.lm_type,
    preview,
    senderId: row.lm_sender_id,
    senderName: row.lm_sender_name,
    createdAt: row.lm_created_at,
    deleted: Boolean(row.lm_deleted_at),
  };
}

function accessFromPeer(peer) {
  if (!peer) return { canMessage: false, reason: 'peer_missing' };
  if (peer.blocked_by_me) return { canMessage: false, reason: 'blocked_by_me' };
  if (peer.blocked_me) return { canMessage: false, reason: 'blocked_me' };
  if (!peer.is_friend) return { canMessage: false, reason: 'not_friends' };
  return { canMessage: true, reason: null };
}

function mapSummary(row, peers, viewerId) {
  const peer = peers.find((item) => item.chat_id === row.id) ?? null;
  const otherUser = peer
    ? mapPublicUser(peer, { viewerId, viewerIsFriend: Boolean(peer.is_friend) })
    : null;
  const access = row.kind === 'direct' ? accessFromPeer(peer) : { canMessage: true, reason: null };

  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    avatarUrl: row.avatar_url,
    pinned: Boolean(row.is_pinned),
    muted: Boolean(row.is_muted),
    unread: Number(row.unread ?? 0),
    lastReadSeq: Number(row.last_read_seq ?? 0),
    lastMessage: lastMessage(row),
    otherUser,
    canMessage: access.canMessage,
    accessReason: access.reason,
    membersCount: row.kind === 'direct' ? 2 : Number(row.members_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.last_message_at,
  };
}

export async function listForUser(userId) {
  const rows = await repo.getListRows(userId);
  const peers = await repo.getPeersForChats(
    rows.map((row) => row.id),
    userId,
  );
  return rows.map((row) => mapSummary(row, peers, userId));
}

export async function getSummary(chatId, userId) {
  const rows = await repo.getListRows(userId);
  const row = rows.find((item) => item.id === chatId);
  if (!row) throw notFound('Conversation not found.');
  const peers = await repo.getPeersForChats([chatId], userId);
  return mapSummary(row, peers, userId);
}

export async function getDetail(chatId, userId) {
  const access = await repo.getAccessState(chatId, userId);
  if (!access) throw notFound('Conversation not found.');

  const [summary, memberData] = await Promise.all([
    getSummary(chatId, userId),
    repo.getChatWithMembers(chatId, userId),
  ]);

  const members = (memberData?.members ?? []).map((row) => ({
    ...mapPublicUser(row, {
      viewerId: userId,
      viewerIsFriend: Boolean(row.is_friend) || row.id === userId,
    }),
    role: row.role,
    joinedAt: row.joined_at,
    isFriend: Boolean(row.is_friend) || row.id === userId,
    blockedByMe: Boolean(row.blocked_by_me),
    blockedMe: Boolean(row.blocked_me),
  }));

  return {
    chat: {
      ...summary,
      canMessage: access.canMessage,
      accessReason: access.reason,
    },
    members,
  };
}

export async function createDirect(userId, otherId) {
  if (userId === otherId) throw badRequest('You cannot start a conversation with yourself.');

  const other = await findUserById(otherId);
  if (!other) throw notFound('We could not find that person.');

  const [friends, blocks] = await Promise.all([
    areFriends(userId, otherId),
    getBlockState(userId, otherId),
  ]);
  if (blocks.blockedByMe || blocks.blockedMe) {
    throw forbidden('This person is not available right now.');
  }
  if (!friends) throw forbidden('You need to be friends before starting a conversation.');

  const chat = await repo.ensureDirectChat(userId, otherId);
  return getSummary(chat.id, userId);
}

export async function updatePreferences(chatId, userId, { pinned, muted }) {
  const membership = await repo.getMembership(chatId, userId);
  if (!membership) throw notFound('Conversation not found.');

  if (typeof pinned === 'boolean') await repo.setPinned(chatId, userId, pinned);
  if (typeof muted === 'boolean') await repo.setMuted(chatId, userId, muted);

  return getSummary(chatId, userId);
}

export async function getMemberIds(chatId) {
  return repo.getMemberIds(chatId);
}

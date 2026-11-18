import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { mapPublicUser } from '../../utils/serialize.js';
import { emitToUser } from '../../realtime/events.js';
import { findUserById } from '../auth/auth.repository.js';
import { notify } from '../notifications/notifications.service.js';
import * as repo from './friends.repository.js';

function requestUser(row, viewerId) {
  // Show the person on the other side of the request: the receiver sees the
  // sender, and the sender sees the receiver.
  const isSender = row.sender_id === viewerId;
  const prefix = isSender ? 'receiver' : 'sender';
  return mapPublicUser(
    {
      id: row[`${prefix}_id`],
      username: row[`${prefix}_username`],
      display_name: row[`${prefix}_display_name`],
      avatar_url: row[`${prefix}_avatar_url`],
      about: row[`${prefix}_about`],
      status: row[`${prefix}_status`],
      last_seen_at: row[`${prefix}_last_seen_at`],
      created_at: row[`${prefix}_created_at`],
      presence_visibility: row[`${prefix}_presence_visibility`],
      last_seen_visibility: row[`${prefix}_last_seen_visibility`],
    },
    { viewerId, viewerIsFriend: false },
  );
}

function mapRequest(row, viewerId) {
  return {
    id: row.id,
    status: row.status,
    message: row.message,
    direction: row.sender_id === viewerId ? 'outgoing' : 'incoming',
    user: requestUser(row, viewerId),
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}

export async function listFriends(userId) {
  const rows = await repo.listFriends(userId);
  return rows.map((row) => ({
    user: mapPublicUser(row, { viewerId: userId, viewerIsFriend: true }),
    friendsSince: row.friends_since,
  }));
}

export async function listRequests(userId) {
  const rows = await repo.listRequests(userId);
  const incoming = [];
  const outgoing = [];
  for (const row of rows) {
    const mapped = mapRequest(row, userId);
    if (mapped.direction === 'incoming') incoming.push(mapped);
    else outgoing.push(mapped);
  }
  return { incoming, outgoing };
}

export async function sendRequest(senderId, receiverId, message = null) {
  if (senderId === receiverId) throw badRequest('You cannot send a friend request to yourself.');

  const receiver = await findUserById(receiverId);
  if (!receiver) throw notFound('We could not find that person.');

  if (await repo.areFriends(senderId, receiverId)) {
    throw conflict('You are already friends.', 'ALREADY_FRIENDS');
  }

  const blocks = await repo.getBlockState(senderId, receiverId);
  if (blocks.blockedByMe || blocks.blockedMe) {
    throw forbidden('This person is not available for friend requests.');
  }

  const pending = await repo.findPendingBetween(senderId, receiverId);
  if (pending) {
    if (pending.sender_id === receiverId) {
      return acceptRequest(pending.id, senderId);
    }
    throw conflict('You already have a pending request with this person.', 'REQUEST_PENDING');
  }

  let request;
  try {
    request = await repo.createRequest(senderId, receiverId, message);
  } catch (error) {
    if (error.code === '23505') {
      throw conflict('You already have a pending request with this person.', 'REQUEST_PENDING');
    }
    throw error;
  }

  const sender = await findUserById(senderId);
  await notify({
    userId: receiverId,
    actorId: senderId,
    type: 'friend_request',
    payload: {
      title: `${sender.display_name} wants to connect`,
      body: message || 'Open your requests to respond.',
      requestId: request.id,
    },
  });

  const payload = {
    id: request.id,
    status: request.status,
    message: request.message,
    direction: 'outgoing',
    user: mapPublicUser(receiver, { viewerId: senderId, viewerIsFriend: false }),
    createdAt: request.created_at,
    respondedAt: null,
  };
  emitToUser(receiverId, 'friend:request:new', {
    ...payload,
    direction: 'incoming',
    user: mapPublicUser(sender, { viewerId: receiverId, viewerIsFriend: false }),
  });
  emitToUser(senderId, 'friend:request:sent', payload);

  return { accepted: false, request: payload };
}

async function acceptRequestRow(row, actingUserId) {
  const result = await repo.acceptRequestTx(row);
  if (!result) throw conflict('This request has already been handled.', 'REQUEST_HANDLED');

  const accepter = await findUserById(actingUserId);
  const otherId = row.sender_id === actingUserId ? row.receiver_id : row.sender_id;
  const other = await findUserById(otherId);

  await notify({
    userId: otherId,
    actorId: actingUserId,
    type: 'friend_accept',
    payload: {
      title: `${accepter.display_name} accepted your request`,
      body: 'You can start chatting now.',
      chatId: result.chat.id,
    },
  });

  const event = {
    requestId: result.request.id,
    chatId: result.chat.id,
    user: mapPublicUser(accepter, { viewerId: otherId, viewerIsFriend: true }),
  };
  emitToUser(row.sender_id, 'friend:accepted', event);
  emitToUser(row.receiver_id, 'friend:accepted', event);

  return {
    accepted: true,
    chatId: result.chat.id,
    request: mapRequest(
      {
        ...result.request,
        sender_id: row.sender_id,
        receiver_id: row.receiver_id,
        sender_username: other?.username,
        sender_display_name: other?.display_name,
        sender_avatar_url: other?.avatar_url,
        sender_about: other?.about,
        sender_status: other?.status,
        sender_last_seen_at: other?.last_seen_at,
        sender_created_at: other?.created_at,
      },
      actingUserId,
    ),
  };
}

export async function acceptRequest(requestId, userId) {
  const row = await repo.findRequestById(requestId);
  if (!row) throw notFound('Friend request not found.');
  if (row.status !== 'pending')
    throw conflict('This request has already been handled.', 'REQUEST_HANDLED');
  if (row.receiver_id !== userId) throw forbidden('Only the recipient can accept this request.');
  return acceptRequestRow(row, userId);
}

export async function declineRequest(requestId, userId) {
  const row = await repo.findRequestById(requestId);
  if (!row) throw notFound('Friend request not found.');
  if (row.status !== 'pending')
    throw conflict('This request has already been handled.', 'REQUEST_HANDLED');
  if (row.receiver_id !== userId) throw forbidden('Only the recipient can decline this request.');

  await repo.updateRequestStatus(requestId, 'declined');
  emitToUser(row.sender_id, 'friend:request:removed', { requestId, reason: 'declined' });
  emitToUser(row.receiver_id, 'friend:request:removed', { requestId, reason: 'declined' });
  return { success: true };
}

export async function cancelRequest(requestId, userId) {
  const row = await repo.findRequestById(requestId);
  if (!row) throw notFound('Friend request not found.');
  if (row.sender_id !== userId) throw forbidden('Only the sender can cancel this request.');
  if (row.status !== 'pending')
    throw conflict('This request has already been handled.', 'REQUEST_HANDLED');

  await repo.updateRequestStatus(requestId, 'cancelled');
  emitToUser(row.sender_id, 'friend:request:removed', { requestId, reason: 'cancelled' });
  emitToUser(row.receiver_id, 'friend:request:removed', { requestId, reason: 'cancelled' });
  return { success: true };
}

export async function removeFriend(userId, friendId) {
  if (userId === friendId) throw badRequest('That is not a valid contact.');
  const removed = await repo.deleteFriendship(userId, friendId);
  if (removed) {
    emitToUser(userId, 'friend:removed', { userId: friendId });
    emitToUser(friendId, 'friend:removed', { userId });
  }
  return { success: true };
}

export async function block(userId, targetId) {
  if (userId === targetId) throw badRequest('You cannot block yourself.');
  const target = await findUserById(targetId);
  if (!target) throw notFound('We could not find that person.');

  await repo.blockUserTx(userId, targetId);
  emitToUser(userId, 'friend:removed', { userId: targetId });
  emitToUser(targetId, 'friend:removed', { userId });
  emitToUser(userId, 'contact:blocked', { user: mapPublicUser(target, { viewerId: userId }) });
  emitToUser(targetId, 'contact:blocked-you', { userId });
  return { success: true };
}

export async function unblock(userId, targetId) {
  const removed = await repo.unblockUser(userId, targetId);
  if (removed) {
    emitToUser(userId, 'contact:unblocked', { userId: targetId });
  }
  return { success: true };
}

export async function listBlocked(userId) {
  const rows = await repo.listBlocked(userId);
  return rows.map((row) => ({
    user: mapPublicUser(row, { viewerId: userId, viewerIsFriend: false }),
    blockedAt: row.blocked_at,
  }));
}

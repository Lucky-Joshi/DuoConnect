import { query, withTransaction } from '../../db/index.js';
import { ensureDirectChatTx } from '../chats/chats.repository.js';

export async function areFriends(userA, userB) {
  const { rows } = await query(
    `SELECT 1 FROM friendships
      WHERE user_low = least($1::uuid, $2::uuid) AND user_high = greatest($1::uuid, $2::uuid)
      LIMIT 1`,
    [userA, userB],
  );
  return rows.length > 0;
}

export async function getBlockState(userA, userB) {
  const { rows } = await query(
    `SELECT blocker_id, blocked_id FROM blocks
      WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [userA, userB],
  );
  return {
    blockedByMe: rows.some((row) => row.blocker_id === userA),
    blockedMe: rows.some((row) => row.blocker_id === userB),
  };
}

export async function getFriendIds(userId) {
  const { rows } = await query(
    `SELECT CASE WHEN user_low = $1 THEN user_high ELSE user_low END AS friend_id
       FROM friendships WHERE user_low = $1 OR user_high = $1`,
    [userId],
  );
  return rows.map((row) => row.friend_id);
}

export async function listFriends(userId) {
  const { rows } = await query(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.about, u.status,
            u.last_seen_at, u.created_at,
            s.presence_visibility, s.last_seen_visibility,
            f.created_at AS friends_since
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_low = $1 THEN f.user_high ELSE f.user_low END
       LEFT JOIN user_settings s ON s.user_id = u.id
      WHERE (f.user_low = $1 OR f.user_high = $1) AND u.deleted_at IS NULL
      ORDER BY u.status <> 'offline' DESC, lower(u.display_name) ASC`,
    [userId],
  );
  return rows;
}

export async function listRequests(userId) {
  const { rows } = await query(
    `SELECT fr.*,
            su.username AS sender_username, su.display_name AS sender_display_name,
            su.avatar_url AS sender_avatar_url, su.about AS sender_about,
            su.status AS sender_status, su.last_seen_at AS sender_last_seen_at,
            su.created_at AS sender_created_at,
            ss.presence_visibility AS sender_presence_visibility,
            ss.last_seen_visibility AS sender_last_seen_visibility,
            ru.username AS receiver_username, ru.display_name AS receiver_display_name,
            ru.avatar_url AS receiver_avatar_url, ru.about AS receiver_about,
            ru.status AS receiver_status, ru.last_seen_at AS receiver_last_seen_at,
            ru.created_at AS receiver_created_at,
            rs.presence_visibility AS receiver_presence_visibility,
            rs.last_seen_visibility AS receiver_last_seen_visibility
       FROM friend_requests fr
       JOIN users su ON su.id = fr.sender_id
       JOIN users ru ON ru.id = fr.receiver_id
       LEFT JOIN user_settings ss ON ss.user_id = su.id
       LEFT JOIN user_settings rs ON rs.user_id = ru.id
      WHERE (fr.receiver_id = $1 OR fr.sender_id = $1) AND fr.status = 'pending'
      ORDER BY fr.created_at DESC`,
    [userId],
  );
  return rows;
}

export async function findRequestById(requestId) {
  const { rows } = await query('SELECT * FROM friend_requests WHERE id = $1 LIMIT 1', [requestId]);
  return rows[0] ?? null;
}

export async function findPendingBetween(userA, userB) {
  const { rows } = await query(
    `SELECT * FROM friend_requests
      WHERE status = 'pending'
        AND ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
      LIMIT 1`,
    [userA, userB],
  );
  return rows[0] ?? null;
}

export async function createRequest(senderId, receiverId, message) {
  const { rows } = await query(
    `INSERT INTO friend_requests (sender_id, receiver_id, message)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [senderId, receiverId, message || null],
  );
  return rows[0];
}

export async function acceptRequestTx(request) {
  return withTransaction(async (tx) => {
    const updated = await tx.query(
      `UPDATE friend_requests SET status = 'accepted', responded_at = now()
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [request.id],
    );
    if (!updated.rows[0]) return null;

    await tx.query(
      `INSERT INTO friendships (user_low, user_high)
       VALUES (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid))
       ON CONFLICT (user_low, user_high) DO NOTHING`,
      [request.sender_id, request.receiver_id],
    );

    const chat = await ensureDirectChatTx(tx, request.sender_id, request.receiver_id);

    return { request: updated.rows[0], chat };
  });
}

export async function updateRequestStatus(requestId, status) {
  const { rows } = await query(
    `UPDATE friend_requests SET status = $2, responded_at = now()
      WHERE id = $1 AND status = 'pending'
      RETURNING *`,
    [requestId, status],
  );
  return rows[0] ?? null;
}

export async function deleteFriendRequest(requestId) {
  await query('DELETE FROM friend_requests WHERE id = $1', [requestId]);
}

export async function deleteFriendship(userA, userB) {
  const { rows } = await query(
    `DELETE FROM friendships
      WHERE user_low = least($1::uuid, $2::uuid) AND user_high = greatest($1::uuid, $2::uuid)
      RETURNING id`,
    [userA, userB],
  );
  return rows[0] ?? null;
}

export async function blockUserTx(blockerId, blockedId) {
  return withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [blockerId, blockedId],
    );
    await tx.query(
      `DELETE FROM friendships
        WHERE user_low = least($1::uuid, $2::uuid) AND user_high = greatest($1::uuid, $2::uuid)`,
      [blockerId, blockedId],
    );
    await tx.query(
      `UPDATE friend_requests SET status = 'cancelled', responded_at = now()
        WHERE status = 'pending'
          AND ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))`,
      [blockerId, blockedId],
    );
  });
}

export async function unblockUser(blockerId, blockedId) {
  const { rowCount } = await query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [
    blockerId,
    blockedId,
  ]);
  return rowCount > 0;
}

export async function listBlocked(blockerId) {
  const { rows } = await query(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.about, u.status,
            u.last_seen_at, u.created_at,
            s.presence_visibility, s.last_seen_visibility, b.created_at AS blocked_at
       FROM blocks b
       JOIN users u ON u.id = b.blocked_id
       LEFT JOIN user_settings s ON s.user_id = u.id
      WHERE b.blocker_id = $1 AND u.deleted_at IS NULL
      ORDER BY b.created_at DESC`,
    [blockerId],
  );
  return rows;
}

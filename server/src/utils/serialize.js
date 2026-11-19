export function mapSettings(row) {
  if (!row) {
    return {
      theme: 'system',
      accent: 'violet',
      wallpaper: 'aurora',
      notifications: {
        messages: true,
        friendRequests: true,
        calls: true,
        sounds: true,
        desktop: false,
      },
      privacy: {
        readReceipts: true,
        presence: 'friends',
        lastSeen: 'friends',
      },
    };
  }
  return {
    theme: row.theme,
    accent: row.accent,
    wallpaper: row.wallpaper,
    notifications: {
      messages: row.message_notifications,
      friendRequests: row.friend_request_notifications,
      calls: row.call_notifications,
      sounds: row.sound_enabled,
      desktop: row.desktop_notifications,
    },
    privacy: {
      readReceipts: row.read_receipts,
      presence: row.presence_visibility,
      lastSeen: row.last_seen_visibility,
    },
  };
}

export function mapPublicUser(row, { viewerIsFriend = false, viewerId = null } = {}) {
  if (!row) return null;
  const isSelf = viewerId === row.id;
  const presenceVisibility = row.presence_visibility ?? 'friends';
  const lastSeenVisibility = row.last_seen_visibility ?? 'friends';
  const canSeePresence =
    isSelf ||
    presenceVisibility === 'everyone' ||
    (presenceVisibility === 'friends' && viewerIsFriend);
  const canSeeLastSeen =
    isSelf ||
    lastSeenVisibility === 'everyone' ||
    (lastSeenVisibility === 'friends' && viewerIsFriend);

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name ?? row.displayName,
    avatarUrl: row.avatar_url ?? row.avatarUrl ?? null,
    about: row.about ?? '',
    status: canSeePresence ? (row.status ?? 'offline') : 'offline',
    lastSeenAt: canSeeLastSeen ? (row.last_seen_at ?? row.lastSeenAt ?? null) : null,
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

export function mapAttachment(row) {
  return {
    id: row.id,
    url: row.url,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    provider: row.provider,
  };
}

export function mapMessage(
  row,
  { attachments = [], receipts = [], reactions = [], pinned = false } = {},
) {
  const replyTo = row.reply_id
    ? {
        id: row.reply_id,
        body: row.reply_deleted_at ? null : row.reply_body,
        type: row.reply_type,
        sender: {
          id: row.reply_sender_id,
          username: row.reply_username,
          displayName: row.reply_display_name,
          avatarUrl: row.reply_avatar_url,
        },
        deleted: Boolean(row.reply_deleted_at),
      }
    : null;

  return {
    id: row.id,
    seq: Number(row.seq),
    chatId: row.chat_id,
    sender: {
      id: row.sender_id,
      username: row.sender_username,
      displayName: row.sender_display_name,
      avatarUrl: row.sender_avatar_url,
    },
    type: row.type,
    body: row.deleted_at ? null : row.body,
    metadata: row.metadata ?? {},
    replyTo,
    forwardedFromId: row.forwarded_from_id ?? null,
    clientId: row.client_id ?? null,
    attachments,
    receipts: receipts.map((receipt) => ({
      userId: receipt.user_id,
      deliveredAt: receipt.delivered_at,
      readAt: receipt.read_at,
    })),
    reactions,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    isPinned: pinned,
  };
}

export function mapNotification(row, actor = null) {
  return {
    id: row.id,
    type: row.type,
    actor: actor
      ? {
          id: actor.id,
          username: actor.username,
          displayName: actor.display_name,
          avatarUrl: actor.avatar_url,
        }
      : null,
    chatId: row.chat_id,
    callId: row.call_id,
    payload: row.payload ?? {},
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function mapCall(row) {
  return {
    id: row.id,
    chatId: row.chat_id,
    kind: row.kind,
    status: row.status,
    caller: {
      id: row.caller_id,
      username: row.caller_username,
      displayName: row.caller_display_name,
      avatarUrl: row.caller_avatar_url,
    },
    callee: {
      id: row.callee_id,
      username: row.callee_username,
      displayName: row.callee_display_name,
      avatarUrl: row.callee_avatar_url,
    },
    startedAt: row.started_at,
    answeredAt: row.answered_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    endReason: row.end_reason,
    createdAt: row.created_at,
  };
}

export function mapSession(row, currentHash = null) {
  return {
    id: row.id,
    userAgent: row.user_agent,
    ip: row.ip,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    current: currentHash ? row.token_hash === currentHash : false,
  };
}

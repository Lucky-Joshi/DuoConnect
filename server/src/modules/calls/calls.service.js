import { AppError, badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { mapCall } from '../../utils/serialize.js';
import { CALL_RING_TIMEOUT_MS } from '../../config/constants.js';
import { emitToUser } from '../../realtime/events.js';
import * as chatsRepo from '../chats/chats.repository.js';
import { notify } from '../notifications/notifications.service.js';
import * as push from '../notifications/push.service.js';
import * as repo from './calls.repository.js';

const ringTimers = new Map();

function clearRingTimer(callId) {
  const timer = ringTimers.get(callId);
  if (timer) {
    clearTimeout(timer);
    ringTimers.delete(callId);
  }
}

function emitBoth(call, event) {
  emitToUser(call.caller.id, event, call);
  emitToUser(call.callee.id, event, call);
}

async function finishCall(callId, userId, { status, reason }) {
  const row = await repo.getCallRow(callId);
  if (!row) throw notFound('Call not found.');
  if (row.caller_id !== userId && row.callee_id !== userId) {
    throw forbidden('You are not part of this call.');
  }

  if (row.status === 'ringing') {
    const callerEnding = row.caller_id === userId;
    const result = await repo.transitionCall(callId, ['ringing'], {
      status: callerEnding ? 'cancelled' : 'declined',
      ended_at: new Date(),
      end_reason: callerEnding ? 'cancelled' : 'declined',
    });
    clearRingTimer(callId);
    if (!result) return null;
    emitBoth(result, callerEnding ? 'call:cancelled' : 'call:declined');

    const otherId = callerEnding ? row.callee_id : row.caller_id;
    await notify({
      userId: otherId,
      actorId: userId,
      type: 'call_ended',
      payload: {
        title: callerEnding ? 'Missed call' : 'Call declined',
        body: callerEnding
          ? `${result.caller.displayName} called you`
          : `${result.callee.displayName} declined your call`,
        callId,
        kind: row.kind,
      },
      callId,
    });
    return result;
  }

  if (row.status !== 'ongoing') return mapCall(row);

  const endedAt = new Date();
  const answeredAt = row.answered_at ? new Date(row.answered_at) : endedAt;
  const duration = Math.max(0, Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000));
  const finalStatus = status === 'failed' ? 'failed' : 'completed';

  const updated = await repo.transitionCall(callId, ['ongoing'], {
    status: finalStatus,
    ended_at: endedAt,
    duration_seconds: duration,
    end_reason: reason ?? 'hangup',
  });
  if (!updated) return null;

  emitBoth(updated, 'call:ended');
  const otherId = updated.caller.id === userId ? updated.callee.id : updated.caller.id;
  if (reason !== 'disconnected') {
    await notify({
      userId: otherId,
      actorId: userId,
      type: 'call_ended',
      payload: {
        title: 'Call ended',
        body: `Call lasted ${Math.floor(duration / 60)}m ${duration % 60}s`,
        callId,
        durationSeconds: duration,
        kind: row.kind,
      },
      callId,
    });
  }
  return updated;
}

export async function startCall(userId, { chatId, kind }) {
  if (!['audio', 'video'].includes(kind)) throw badRequest('Choose an audio or video call.');

  const access = await chatsRepo.getAccessState(chatId, userId);
  if (!access) throw notFound('Conversation not found.');
  if (!access.canMessage) {
    throw new AppError(403, 'CALL_NOT_ALLOWED', 'You cannot call this person right now.', {
      reason: access.reason,
    });
  }
  if (access.chat.kind !== 'direct' || !access.peer) {
    throw badRequest('Group calls are not available yet.');
  }

  const active = await repo.findActiveBetween(userId, access.peer.id);
  if (active) {
    throw conflict('There is already a call in progress with this person.', 'CALL_IN_PROGRESS');
  }

  const callId = await repo.createCall({
    chatId,
    callerId: userId,
    calleeId: access.peer.id,
    kind,
  });
  const call = await repo.getCallById(callId);

  emitToUser(call.callee.id, 'call:incoming', call);
  emitToUser(call.caller.id, 'call:ringing', call);

  // An offline callee has no socket to ring, so wake the device with Web Push.
  await push.sendToUser(
    call.callee.id,
    {
      type: 'incoming_call',
      title: `Incoming ${call.kind} call`,
      body: `${call.caller.displayName} is calling`,
      url: `/app/c/${chatId}`,
      tag: `call:${callId}`,
      icon: '/icon-192.png',
      actions: [
        { action: 'open', title: 'Open chat' },
        { action: 'calls', title: 'View calls' },
      ],
    },
    { ttl: Math.ceil(CALL_RING_TIMEOUT_MS / 1000) },
  );

  const timer = setTimeout(async () => {
    ringTimers.delete(callId);
    try {
      const missed = await repo.transitionCall(callId, ['ringing'], {
        status: 'missed',
        ended_at: new Date(),
        end_reason: 'timeout',
      });
      if (!missed) return;
      emitBoth(missed, 'call:missed');
      await notify({
        userId: missed.callee.id,
        actorId: missed.caller.id,
        type: 'missed_call',
        payload: {
          title: `Missed ${missed.kind} call`,
          body: `${missed.caller.displayName} tried to reach you`,
          callId,
          kind: missed.kind,
        },
        callId,
      });
    } catch {
      // Timers are best-effort; stale calls are reconciled on boot.
    }
  }, CALL_RING_TIMEOUT_MS);
  timer.unref?.();
  ringTimers.set(callId, timer);

  return call;
}

export async function acceptCall(callId, userId) {
  const row = await repo.getCallRow(callId);
  if (!row) throw notFound('Call not found.');
  if (row.callee_id !== userId) throw forbidden('Only the person being called can answer.');
  if (row.status !== 'ringing')
    throw conflict('This call is no longer ringing.', 'CALL_NOT_RINGING');

  clearRingTimer(callId);
  const call = await repo.transitionCall(callId, ['ringing'], {
    status: 'ongoing',
    answered_at: new Date(),
  });
  if (!call) throw conflict('This call is no longer ringing.', 'CALL_NOT_RINGING');

  emitBoth(call, 'call:accepted');
  return call;
}

export async function rejectCall(callId, userId) {
  const row = await repo.getCallRow(callId);
  if (!row) throw notFound('Call not found.');
  if (row.callee_id !== userId) throw forbidden('Only the person being called can decline.');
  if (row.status !== 'ringing')
    throw conflict('This call is no longer ringing.', 'CALL_NOT_RINGING');

  clearRingTimer(callId);
  const call = await repo.transitionCall(callId, ['ringing'], {
    status: 'declined',
    ended_at: new Date(),
    end_reason: 'declined',
  });
  if (!call) throw conflict('This call is no longer ringing.', 'CALL_NOT_RINGING');

  emitBoth(call, 'call:declined');
  await notify({
    userId: call.caller.id,
    actorId: userId,
    type: 'call_ended',
    payload: {
      title: 'Call declined',
      body: `${call.callee.displayName} declined your ${call.kind} call`,
      callId,
      kind: call.kind,
    },
    callId,
  });
  return call;
}

export async function cancelCall(callId, userId) {
  const row = await repo.getCallRow(callId);
  if (!row) throw notFound('Call not found.');
  if (row.caller_id !== userId) throw forbidden('Only the caller can cancel this call.');
  if (row.status !== 'ringing')
    throw conflict('This call has already started.', 'CALL_NOT_RINGING');

  clearRingTimer(callId);
  const call = await repo.transitionCall(callId, ['ringing'], {
    status: 'cancelled',
    ended_at: new Date(),
    end_reason: 'cancelled',
  });
  if (!call) return null;
  emitBoth(call, 'call:cancelled');
  return call;
}

export async function endCall(callId, userId, { reason = 'hangup' } = {}) {
  return finishCall(callId, userId, { status: 'completed', reason });
}

export async function failCall(callId, userId, reason = 'connection_failed') {
  return finishCall(callId, userId, { status: 'failed', reason });
}

export async function getCallForParticipant(callId, userId) {
  const row = await repo.getCallById(callId);
  if (!row) throw notFound('Call not found.');
  if (row.caller.id !== userId && row.callee.id !== userId) {
    throw forbidden('You are not part of this call.');
  }
  return row;
}

export async function assertActiveParticipant(callId, userId) {
  const call = await getCallForParticipant(callId, userId);
  if (!['ringing', 'ongoing'].includes(call.status)) {
    throw conflict('This call has ended.', 'CALL_ENDED');
  }
  return call;
}

export async function history(userId, limit = 50) {
  const rows = await repo.listCallHistory(userId, limit);
  return rows.map(mapCall);
}

/** Lets a client that missed the socket event recover a call still ringing. */
export async function getIncomingCall(userId) {
  const rows = await repo.findActiveForUser(userId);
  const ringing = rows.find((row) => row.status === 'ringing' && row.callee_id === userId);
  return ringing ? repo.getCallById(ringing.id) : null;
}

export async function reconcileStaleCalls() {
  return repo.markStaleRinging();
}

export async function handleUserDisconnect(userId) {
  const active = await repo.findActiveForUser(userId);
  for (const row of active) {
    try {
      if (row.status === 'ringing') {
        if (row.caller_id === userId) await cancelCall(row.id, userId);
        else await rejectCall(row.id, userId);
      } else {
        await endCall(row.id, userId, { reason: 'disconnected' });
      }
    } catch {
      // A race with the other participant ending the call is fine.
    }
  }
}

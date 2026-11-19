import { z } from 'zod';
import { badRequest } from '../../utils/errors.js';
import { uuidSchema } from '../../utils/validation.js';
import { emitToUser } from '../events.js';
import * as callsService from '../../modules/calls/calls.service.js';
import { createRateGate, registerHandler } from './shared.js';

const MAX_SIGNAL_BYTES = 200_000;

const startSchema = z.object({
  chatId: uuidSchema,
  kind: z.enum(['audio', 'video']),
});

const callIdSchema = z.object({ callId: uuidSchema });

const endSchema = callIdSchema.extend({
  reason: z.enum(['hangup', 'connection_failed', 'user_left']).optional(),
});

const signalSchema = z.object({
  callId: uuidSchema,
  type: z.enum(['offer', 'answer', 'ice', 'renegotiate', 'media', 'quality']),
  data: z.unknown().optional(),
});

function relayPeer(call, userId) {
  return call.caller.id === userId ? call.callee.id : call.caller.id;
}

/**
 * Call lifecycle and WebRTC signaling. Media never touches the server: the
 * server only authenticates participants and relays SDP/ICE between their user
 * rooms. That keeps calls peer-to-peer while still enforcing call membership.
 */
export default function registerCallHandlers(socket) {
  const userId = socket.data.userId;
  const signalGate = createRateGate({ limit: 120, windowMs: 10_000 });
  const actionGate = createRateGate({ limit: 15, windowMs: 10_000 });

  registerHandler(socket, 'call:start', async (payload) => {
    actionGate();
    const input = startSchema.parse(payload);
    return callsService.startCall(userId, input);
  });

  registerHandler(socket, 'call:accept', async (payload) => {
    actionGate();
    const { callId } = callIdSchema.parse(payload);
    return callsService.acceptCall(callId, userId);
  });

  registerHandler(socket, 'call:reject', async (payload) => {
    actionGate();
    const { callId } = callIdSchema.parse(payload);
    return callsService.rejectCall(callId, userId);
  });

  registerHandler(socket, 'call:cancel', async (payload) => {
    actionGate();
    const { callId } = callIdSchema.parse(payload);
    return callsService.cancelCall(callId, userId);
  });

  registerHandler(socket, 'call:end', async (payload) => {
    actionGate();
    const { callId, reason } = endSchema.parse(payload);
    return callsService.endCall(callId, userId, { reason: reason ?? 'hangup' });
  });

  registerHandler(socket, 'call:fail', async (payload) => {
    actionGate();
    const { callId, reason } = endSchema.parse(payload);
    return callsService.failCall(callId, userId, reason ?? 'connection_failed');
  });

  registerHandler(socket, 'call:signal', async (payload) => {
    signalGate();
    const input = signalSchema.parse(payload);

    const call = await callsService.assertActiveParticipant(input.callId, userId);
    // Ringing is allowed so the caller can send its offer and ICE candidates
    // while waiting for an answer; the callee queues them until it accepts.
    if (!['ringing', 'ongoing'].includes(call.status)) {
      throw badRequest('This call has ended.');
    }
    if (input.data !== undefined) {
      const size = Buffer.byteLength(JSON.stringify(input.data));
      if (size > MAX_SIGNAL_BYTES) throw badRequest('That media signal is too large.');
    }

    emitToUser(relayPeer(call, userId), 'call:signal', {
      callId: input.callId,
      from: userId,
      type: input.type,
      data: input.data ?? null,
      sentAt: new Date().toISOString(),
    });
    return { relayed: true };
  });
}

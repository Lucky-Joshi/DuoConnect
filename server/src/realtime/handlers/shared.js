import { AppError } from '../../utils/errors.js';
import { logger } from '../../config/logger.js';

function zodDetails(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || 'payload',
    message: issue.message,
  }));
}

/**
 * Convert any thrown value into a compact, safe acknowledgement error.
 * Validation and domain errors are expected; unexpected errors are logged and
 * never leak implementation details to the client.
 */
export function toSocketError(error) {
  if (error?.name === 'ZodError') {
    return {
      expected: true,
      code: 'VALIDATION_ERROR',
      message: 'Some fields need your attention.',
      details: zodDetails(error),
    };
  }
  if (error instanceof AppError) {
    return {
      expected: true,
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }
  return {
    expected: false,
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong. Please try again.',
  };
}

/**
 * Register an async socket event handler that always answers with an ack
 * envelope when the client supplied one. Acks look like:
 *   { ok: true, data } | { ok: false, error: { code, message, details? } }
 */
export function registerHandler(socket, event, handler) {
  socket.on(event, async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : null;
    try {
      const data = await handler(payload && typeof payload === 'object' ? payload : {});
      reply?.({ ok: true, data: data ?? null });
    } catch (error) {
      const envelope = toSocketError(error);
      reply?.({ ok: false, error: envelope });
      if (!envelope.expected) {
        logger.error(
          { err: error, event, userId: socket.data.userId, socketId: socket.id },
          'Socket event failed',
        );
      }
    }
  });
}

/**
 * Sliding-window gate for noisy socket events. Socket.IO has no HTTP rate
 * limiter, so each connection gets a small in-process budget.
 */
export function createRateGate({ limit, windowMs }) {
  let startedAt = Date.now();
  let count = 0;

  return function gate() {
    const now = Date.now();
    if (now - startedAt >= windowMs) {
      startedAt = now;
      count = 0;
    }
    count += 1;
    if (count > limit) {
      throw new AppError(
        429,
        'RATE_LIMITED',
        'You are doing that too quickly. Take a breath and try again.',
      );
    }
  };
}

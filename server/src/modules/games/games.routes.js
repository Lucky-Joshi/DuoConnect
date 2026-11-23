import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { messageLimiter } from '../../middleware/rate-limit.js';
import { z } from 'zod';
import { uuidSchema } from '../../utils/validation.js';
import * as controller from './games.controller.js';
import {
  createInviteSchema,
  drawActionSchema,
  drawStrokeSchema,
  gameIdParams,
  guessSchema,
  tttMoveSchema,
} from './games.validation.js';

const router = Router();
router.use(requireAuth);

const chatParams = z.object({ chatId: uuidSchema });

router.post(
  '/invites',
  messageLimiter,
  validate({ body: createInviteSchema }),
  controller.createInvite,
);
router.get('/chat/:chatId/active', validate({ params: chatParams }), controller.getActive);
router.get('/chat/:chatId/history', validate({ params: chatParams }), controller.history);
router.get('/chat/:chatId/stats', validate({ params: chatParams }), controller.stats);
router.get('/:gameId', validate({ params: gameIdParams }), controller.getGame);
router.post('/:gameId/accept', validate({ params: gameIdParams }), controller.accept);
router.post('/:gameId/decline', validate({ params: gameIdParams }), controller.decline);
router.post(
  '/:gameId/move',
  messageLimiter,
  validate({ params: gameIdParams, body: tttMoveSchema.pick({ index: true }) }),
  controller.move,
);
router.post(
  '/:gameId/stroke',
  messageLimiter,
  validate({ params: gameIdParams, body: drawStrokeSchema.pick({ stroke: true }) }),
  controller.stroke,
);
router.post(
  '/:gameId/draw-action',
  messageLimiter,
  validate({ params: gameIdParams, body: drawActionSchema.omit({ gameId: true }) }),
  controller.drawAction,
);
router.post(
  '/:gameId/guess',
  messageLimiter,
  validate({ params: gameIdParams, body: guessSchema.pick({ guess: true }) }),
  controller.guess,
);
router.post('/:gameId/advance-round', validate({ params: gameIdParams }), controller.advanceRound);
router.post(
  '/:gameId/play-again',
  messageLimiter,
  validate({ params: gameIdParams }),
  controller.playAgain,
);

export default router;

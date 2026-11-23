import { z } from 'zod';
import { uuidSchema } from '../../utils/validation.js';
import {
  createInviteSchema,
  drawActionSchema,
  drawStrokeSchema,
  gameIdParams,
  guessSchema,
  tttMoveSchema,
} from '../../modules/games/games.validation.js';
import * as gamesService from '../../modules/games/games.service.js';
import { registerHandler, createRateGate } from './shared.js';

const idSchema = z.object({ gameId: uuidSchema });

export default function registerGameHandlers(socket) {
  const userId = socket.data.userId;
  const actionGate = createRateGate({ limit: 40, windowMs: 10_000 });
  const drawGate = createRateGate({ limit: 120, windowMs: 10_000 });

  registerHandler(socket, 'game:invite', async (payload) => {
    actionGate();
    const input = createInviteSchema.parse(payload);
    return gamesService.createInvite(userId, input);
  });

  registerHandler(socket, 'game:accept', async (payload) => {
    actionGate();
    const { gameId } = idSchema.parse(payload);
    return gamesService.acceptInvite(gameId, userId);
  });

  registerHandler(socket, 'game:decline', async (payload) => {
    actionGate();
    const { gameId } = idSchema.parse(payload);
    return gamesService.declineInvite(gameId, userId);
  });

  registerHandler(socket, 'game:move', async (payload) => {
    actionGate();
    const input = tttMoveSchema.parse(payload);
    return gamesService.makeTttMove(input.gameId, userId, input.index);
  });

  registerHandler(socket, 'game:stroke', async (payload) => {
    drawGate();
    const input = drawStrokeSchema.parse(payload);
    return gamesService.appendStroke(input.gameId, userId, input.stroke);
  });

  registerHandler(socket, 'game:draw-action', async (payload) => {
    actionGate();
    const input = drawActionSchema.parse(payload);
    return gamesService.drawAction(input.gameId, userId, input.action, input.payload);
  });

  registerHandler(socket, 'game:guess', async (payload) => {
    actionGate();
    const input = guessSchema.parse(payload);
    return gamesService.submitGuess(input.gameId, userId, input.guess);
  });

  registerHandler(socket, 'game:advance-round', async (payload) => {
    actionGate();
    const { gameId } = idSchema.parse(payload);
    return gamesService.advanceDrawRound(gameId, userId);
  });

  registerHandler(socket, 'game:play-again', async (payload) => {
    actionGate();
    const { gameId } = gameIdParams.parse(payload);
    return gamesService.playAgain(gameId, userId);
  });

  registerHandler(socket, 'game:get', async (payload) => {
    const { gameId } = idSchema.parse(payload);
    return gamesService.getGame(gameId, userId);
  });

  registerHandler(socket, 'game:active', async (payload) => {
    const { chatId } = z.object({ chatId: uuidSchema }).parse(payload);
    return gamesService.getActive(chatId, userId);
  });

  return { cleanup() {} };
}

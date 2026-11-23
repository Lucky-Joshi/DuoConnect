import { asyncHandler } from '../../utils/async-handler.js';
import { uuidSchema } from '../../utils/validation.js';
import {
  createInviteSchema,
  drawActionSchema,
  drawStrokeSchema,
  gameIdParams,
  guessSchema,
  tttMoveSchema,
} from './games.validation.js';
import * as service from './games.service.js';

export const createInvite = asyncHandler(async (req, res) => {
  const input = createInviteSchema.parse(req.body);
  res.status(201).json({ data: await service.createInvite(req.user.id, input) });
});

export const getGame = asyncHandler(async (req, res) => {
  const { gameId } = gameIdParams.parse(req.params);
  res.json({ data: await service.getGame(gameId, req.user.id) });
});

export const getActive = asyncHandler(async (req, res) => {
  const chatId = uuidSchema.parse(req.params.chatId);
  res.json({ data: await service.getActive(chatId, req.user.id) });
});

export const accept = asyncHandler(async (req, res) => {
  const { gameId } = gameIdParams.parse(req.params);
  res.json({ data: await service.acceptInvite(gameId, req.user.id) });
});

export const decline = asyncHandler(async (req, res) => {
  const { gameId } = gameIdParams.parse(req.params);
  res.json({ data: await service.declineInvite(gameId, req.user.id) });
});

export const move = asyncHandler(async (req, res) => {
  const { gameId } = gameIdParams.parse(req.params);
  const { index } = tttMoveSchema.pick({ index: true }).parse(req.body);
  res.json({ data: await service.makeTttMove(gameId, req.user.id, index) });
});

export const stroke = asyncHandler(async (req, res) => {
  const { gameId } = gameIdParams.parse(req.params);
  const { stroke } = drawStrokeSchema.pick({ stroke: true }).parse(req.body);
  res.json({ data: await service.appendStroke(gameId, req.user.id, stroke) });
});

export const drawAction = asyncHandler(async (req, res) => {
  const { gameId } = gameIdParams.parse(req.params);
  const input = drawActionSchema.omit({ gameId: true }).parse(req.body);
  res.json({ data: await service.drawAction(gameId, req.user.id, input.action, input.payload) });
});

export const guess = asyncHandler(async (req, res) => {
  const { gameId } = gameIdParams.parse(req.params);
  const { guess } = guessSchema.pick({ guess: true }).parse(req.body);
  res.json({ data: await service.submitGuess(gameId, req.user.id, guess) });
});

export const advanceRound = asyncHandler(async (req, res) => {
  const { gameId } = gameIdParams.parse(req.params);
  res.json({ data: await service.advanceDrawRound(gameId, req.user.id) });
});

export const playAgain = asyncHandler(async (req, res) => {
  const { gameId } = gameIdParams.parse(req.params);
  res.status(201).json({ data: await service.playAgain(gameId, req.user.id) });
});

export const history = asyncHandler(async (req, res) => {
  const chatId = uuidSchema.parse(req.params.chatId);
  res.json({ data: await service.listHistory(chatId, req.user.id) });
});

export const stats = asyncHandler(async (req, res) => {
  const chatId = uuidSchema.parse(req.params.chatId);
  res.json({ data: await service.getStats(chatId, req.user.id) });
});

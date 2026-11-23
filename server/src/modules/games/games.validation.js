import { z } from 'zod';
import { uuidSchema } from '../../utils/validation.js';

export const gameTypeSchema = z.enum(['tictactoe', 'drawguess']);
export const gameIdParams = z.object({ gameId: uuidSchema });

export const createInviteSchema = z.object({
  chatId: uuidSchema,
  type: gameTypeSchema,
  rounds: z.coerce.number().int().min(1).max(5).optional(),
  category: z
    .enum(['animals', 'movies', 'technology', 'sports', 'food', 'places', 'random'])
    .optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

export const tttMoveSchema = z.object({
  gameId: uuidSchema,
  index: z.coerce.number().int().min(0).max(8),
});

export const drawStrokeSchema = z.object({
  gameId: uuidSchema,
  stroke: z.object({
    tool: z.enum(['pencil', 'eraser']),
    color: z.string().max(32).optional().default('#111827'),
    size: z.coerce.number().min(1).max(48).optional().default(4),
    points: z
      .array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }))
      .max(500),
  }),
});

export const drawActionSchema = z.object({
  gameId: uuidSchema,
  action: z.enum(['clear', 'undo', 'redo', 'fill']),
  payload: z.record(z.any()).optional().default({}),
});

export const guessSchema = z.object({
  gameId: uuidSchema,
  guess: z.string().trim().min(1).max(80),
});

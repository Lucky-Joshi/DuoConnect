import { z } from 'zod';

export const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256),
  }),
});

export const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

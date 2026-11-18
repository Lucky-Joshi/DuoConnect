import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .min(3, 'Enter your email address.')
  .max(254, 'This email address is too long.')
  .email('Enter a valid email address.');

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Usernames need at least 3 characters.')
  .max(24, 'Usernames can be at most 24 characters.')
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._]*[a-zA-Z0-9]$/,
    'Use letters, numbers, dots or underscores. Start and end with a letter or number.',
  );

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Add a display name.')
  .max(40, 'Display names can be at most 40 characters.');

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(72, 'Passwords can be at most 72 characters.')
  .regex(/[a-zA-Z]/, 'Include at least one letter.')
  .regex(/[0-9]/, 'Include at least one number.');

export const aboutSchema = z
  .string()
  .trim()
  .max(280, 'Keep your bio under 280 characters.')
  .optional();

export const avatarUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value === '' || value.startsWith('http') || value.startsWith('/'), {
    message: 'Enter a valid image URL.',
  })
  .optional();

export const uuidSchema = z.string().uuid('Invalid identifier.');

export const paginationSchema = z.object({
  cursor: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

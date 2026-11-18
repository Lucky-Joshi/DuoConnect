import { z } from 'zod';
import {
  usernameSchema,
  displayNameSchema,
  aboutSchema,
  avatarUrlSchema,
  searchQuerySchema,
} from '../../utils/validation.js';
import { THEMES, ACCENTS } from '../../config/constants.js';

export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    username: usernameSchema.optional(),
    about: aboutSchema,
    avatarUrl: avatarUrlSchema,
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' });

export const updateSettingsSchema = z
  .object({
    theme: z.enum(THEMES).optional(),
    accent: z.enum(ACCENTS).optional(),
    wallpaper: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{1,32}$/)
      .optional(),
    notifications: z
      .object({
        messages: z.boolean().optional(),
        friendRequests: z.boolean().optional(),
        calls: z.boolean().optional(),
        sounds: z.boolean().optional(),
        desktop: z.boolean().optional(),
      })
      .optional(),
    privacy: z
      .object({
        readReceipts: z.boolean().optional(),
        presence: z.enum(['everyone', 'friends', 'nobody']).optional(),
        lastSeen: z.enum(['everyone', 'friends', 'nobody']).optional(),
      })
      .optional(),
  })
  .refine(
    (value) =>
      value.theme !== undefined ||
      value.accent !== undefined ||
      value.wallpaper !== undefined ||
      value.notifications !== undefined ||
      value.privacy !== undefined,
    { message: 'Nothing to update.' },
  );

export const profileParamsSchema = z.object({
  username: z.string().trim().min(1).max(24),
});

export const searchUsersSchema = searchQuerySchema;

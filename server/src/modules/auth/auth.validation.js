import { z } from 'zod';
import {
  emailSchema,
  usernameSchema,
  displayNameSchema,
  passwordSchema,
} from '../../utils/validation.js';

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  remember: z.boolean().optional().default(false),
});

export const usernameCheckSchema = z.object({
  username: z.string().trim().max(64).optional().default(''),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or username.').max(254),
  password: z.string().min(1, 'Enter your password.').max(72),
  remember: z.boolean().optional().default(false),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.').max(72),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'Choose a password you have not used here before.',
    path: ['newPassword'],
  });

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm.').max(72),
});

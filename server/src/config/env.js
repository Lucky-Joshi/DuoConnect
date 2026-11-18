import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((value) => value === 'true' || value === '1');

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().optional().default(''),
  DATABASE_SSL: booleanish,
  DB_AUTO_MIGRATE: z
    .enum(['true', 'false'])
    .optional()
    .default('true')
    .transform((value) => value === 'true'),
  PGLITE_DATA_DIR: z.string().default('.data/pglite'),
  PGLITE_MEMORY: booleanish,

  JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-change-me-please-32chars'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  REMEMBER_ME_TTL_DAYS: z.coerce.number().int().positive().default(60),
  COOKIE_NAME: z.string().default('dc_refresh'),
  COOKIE_DOMAIN: z.string().optional().default(''),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(15),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  CLOUDINARY_FOLDER: z.string().default('duoconnect'),

  ICE_SERVERS: z
    .string()
    .optional()
    .default(JSON.stringify(DEFAULT_ICE_SERVERS))
    .transform((value, ctx) => {
      if (!value.trim()) return DEFAULT_ICE_SERVERS;
      try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) throw new Error('not an array');
        return parsed;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'ICE_SERVERS must be a JSON array' });
        return DEFAULT_ICE_SERVERS;
      }
    }),

  LOG_LEVEL: z.string().default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${details.join('\n')}`);
}

const raw = parsed.data;
const isProduction = raw.NODE_ENV === 'production';

if (isProduction && raw.JWT_ACCESS_SECRET.includes('change-me')) {
  throw new Error('JWT_ACCESS_SECRET must be changed before running in production.');
}

export const env = {
  ...raw,
  isProduction,
  isTest: raw.NODE_ENV === 'test',
  clientOrigins: raw.CLIENT_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  uploadDir: path.resolve(process.cwd(), raw.UPLOAD_DIR),
  pgliteDir: path.resolve(process.cwd(), raw.PGLITE_DATA_DIR),
  cookie: {
    name: raw.COOKIE_NAME,
    domain: raw.COOKIE_DOMAIN || undefined,
    sameSite: raw.COOKIE_SAME_SITE,
    secure: isProduction,
    path: '/api/auth',
  },
  cloudinaryEnabled: Boolean(
    raw.CLOUDINARY_CLOUD_NAME && raw.CLOUDINARY_API_KEY && raw.CLOUDINARY_API_SECRET,
  ),
};

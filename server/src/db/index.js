import fs from 'node:fs';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

pg.types.setTypeParser(20, (value) => Number(value));

let pool = null;
let pglite = null;
let initialized = false;

function shouldUseSsl() {
  if (!env.DATABASE_URL) return false;
  if (env.DATABASE_SSL === false) return false;
  const host = (() => {
    try {
      return new URL(env.DATABASE_URL).hostname;
    } catch {
      return '';
    }
  })();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
  return true;
}

function normalizeResult(result) {
  if (!result) return { rows: [], rowCount: 0 };
  const rows = result.rows ?? [];
  return {
    rows,
    rowCount: result.rowCount ?? result.affectedRows ?? rows.length,
  };
}

export async function initDb() {
  if (initialized) return;

  if (env.DATABASE_URL) {
    pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: env.isTest ? 4 : 12,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: shouldUseSsl() ? { rejectUnauthorized: false } : undefined,
    });
    pool.on('error', (error) => logger.error({ err: error }, 'Unexpected Postgres pool error'));
    logger.info({ mode: 'postgres' }, 'Database connected');
  } else {
    const memory = env.PGLITE_MEMORY || env.NODE_ENV === 'test';
    if (!memory) fs.mkdirSync(env.pgliteDir, { recursive: true });
    pglite = new PGlite(memory ? undefined : env.pgliteDir);
    await pglite.waitReady;
    logger.info({ mode: memory ? 'pglite-memory' : 'pglite-disk' }, 'Embedded database ready');
  }

  initialized = true;
}

export async function query(text, params = []) {
  if (!initialized) await initDb();
  if (pool) return normalizeResult(await pool.query(text, params));
  return normalizeResult(await pglite.query(text, params));
}

export async function exec(sql) {
  if (!initialized) await initDb();
  if (pool) return pool.query(sql);
  return pglite.exec(sql);
}

export async function withTransaction(handler) {
  if (!initialized) await initDb();

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await handler({
        query: async (text, params = []) => normalizeResult(await client.query(text, params)),
        exec: async (text) => client.query(text),
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return pglite.transaction(async (tx) =>
    handler({
      query: async (text, params = []) => normalizeResult(await tx.query(text, params)),
      exec: async (text) => tx.exec(text),
    }),
  );
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (pglite) {
    await pglite.close();
    pglite = null;
  }
  initialized = false;
}

export function dbMode() {
  if (pool) return 'postgres';
  if (pglite) return env.PGLITE_MEMORY || env.NODE_ENV === 'test' ? 'pglite-memory' : 'pglite';
  return 'uninitialized';
}

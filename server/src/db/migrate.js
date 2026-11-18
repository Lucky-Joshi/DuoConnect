import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exec, initDb, query, withTransaction, closeDb, dbMode } from './index.js';
import { logger } from '../config/logger.js';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function runMigrations({ silent = false } = {}) {
  await initDb();

  await exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const applied = new Set(
    (await query('SELECT filename FROM _migrations')).rows.map((row) => row.filename),
  );

  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    await withTransaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    });
    count += 1;
    if (!silent) logger.info({ migration: file }, 'Migration applied');
  }

  if (!silent) logger.info({ applied: count, database: dbMode() }, 'Migrations up to date');
  return count;
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  runMigrations()
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch(async (error) => {
      logger.error({ err: error }, 'Migration failed');
      await closeDb().catch(() => {});
      process.exit(1);
    });
}

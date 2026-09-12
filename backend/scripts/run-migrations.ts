/**
 * Run raw SQL migrations in order, with a persisted history table.
 *
 * Usage:
 *   ts-node scripts/run-migrations.ts                  # apply pending migrations
 *   ts-node scripts/run-migrations.ts --dry-run        # show what would run
 *   ts-node scripts/run-migrations.ts --baseline       # record all as applied without running
 *   ts-node scripts/run-migrations.ts --force          # re-run everything, ignoring history
 *   ts-node scripts/run-migrations.ts --continue-on-error   # old lenient behaviour
 *
 * Why this changed: the previous version logged `❌ <file> failed` and then
 * continued to the next migration, exiting 0. A database left half-migrated was
 * therefore reported as "🎉 All migrations completed", and a missing migration
 * file was silently skipped - both let a broken schema reach production with a
 * green build.
 *
 * Now any failure (or missing file) aborts with a non-zero exit code, and each
 * applied migration is recorded in `schema_migrations` so re-runs are cheap and
 * an edited-after-apply file is detected.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Client } from 'pg';

const migrationsDir = path.join(__dirname, '../database/migrations');

const order = [
  'V1_0__initial_schema.sql',
  'V1_1__system_tables.sql',
  'V2_0__effective_access_function.sql',
  'V2_1__role_model_redesign.sql',
  'V2_2__rbac_tables_role_updates.sql',
  'V2_3__seed_hospital_roles_and_users.sql',
  'V2_4__seed_rbac_configuration.sql',
  'V2_5__fix_evaluate_access_multirole.sql',
  'V3_0__nursing_domain.sql',
  'V3_1__seed_nursing_demo.sql',
  'V3_2__nurse_personal_fields.sql',
  'V3_3__drop_nurse_email.sql',
  'V3_4__nurse_job_no.sql',
];

interface Flags {
  dryRun: boolean;
  baseline: boolean;
  force: boolean;
  continueOnError: boolean;
}

function parseFlags(argv: string[]): Flags {
  return {
    dryRun: argv.includes('--dry-run'),
    baseline: argv.includes('--baseline'),
    force: argv.includes('--force'),
    continueOnError: argv.includes('--continue-on-error'),
  };
}

function checksumOf(sql: string): string {
  return crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16);
}

async function ensureHistoryTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename     TEXT PRIMARY KEY,
      checksum     TEXT NOT NULL,
      applied_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      duration_ms  INTEGER,
      status       TEXT NOT NULL DEFAULT 'Success',
      applied_by   TEXT
    )
  `);
}

async function run() {
  const flags = parseFlags(process.argv.slice(2));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (flags.dryRun) {
      // No database needed to list the planned order.
      console.log('ℹ️  DATABASE_URL not set - dry-run shows the configured order only:');
      order.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2, ' ')}. ${f}`));
      return;
    }
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  console.log('✅ Connected to database');

  await ensureHistoryTable(client);

  const { rows } = await client.query(
    'SELECT filename, checksum, status FROM public.schema_migrations',
  );
  const applied = new Map<string, { checksum: string; status: string }>(
    rows.map((r) => [r.filename, { checksum: r.checksum, status: r.status }]),
  );

  // Fail up-front if a migration the ordering expects is not on disk - the old
  // runner skipped those with a warning and left the schema incomplete.
  const missing = order.filter((f) => !fs.existsSync(path.join(migrationsDir, f)));
  if (missing.length > 0) {
    console.error(`❌ Missing migration file(s): ${missing.join(', ')}`);
    console.error(`   Looked in ${migrationsDir}`);
    await client.end();
    process.exit(1);
  }

  const untracked = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && !order.includes(f));
  if (untracked.length > 0) {
    console.warn(
      `⚠️  SQL file(s) present but not in the migration order list (they will NOT run): ${untracked.join(', ')}`,
    );
  }

  let appliedCount = 0;
  let skippedCount = 0;
  const failures: string[] = [];

  for (const file of order) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    const checksum = checksumOf(sql);
    const previous = applied.get(file);

    if (previous && !flags.force) {
      if (previous.status !== 'Success') {
        console.error(
          `❌ ${file} is recorded as '${previous.status}' from an earlier run. ` +
            `Fix the database or re-run with --force.`,
        );
        failures.push(file);
        if (!flags.continueOnError) break;
        continue;
      }
      if (previous.checksum !== checksum) {
        console.warn(
          `⚠️  ${file} changed after it was applied ` +
            `(recorded ${previous.checksum}, on disk ${checksum}). ` +
            `Already-applied migrations should be immutable - add a new one instead.`,
        );
      }
      skippedCount++;
      continue;
    }

    if (flags.dryRun) {
      console.log(`\n▶️  [dry-run] would apply ${file}`);
      appliedCount++;
      continue;
    }

    if (flags.baseline) {
      await client.query(
        `INSERT INTO public.schema_migrations (filename, checksum, status, applied_by)
         VALUES ($1, $2, 'Success', $3)
         ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, status = 'Success'`,
        [file, checksum, 'baseline'],
      );
      console.log(`📌 ${file} baselined (recorded as applied, not executed)`);
      appliedCount++;
      continue;
    }

    console.log(`\n▶️  Running ${file}...`);
    const startedAt = Date.now();
    try {
      // One transaction per file: PostgreSQL supports transactional DDL, so a
      // failure rolls back cleanly and the migration can simply be retried
      // instead of leaving half-created objects behind.
      await client.query('BEGIN');
      await client.query(sql);
      const duration = Date.now() - startedAt;
      await client.query(
        `INSERT INTO public.schema_migrations (filename, checksum, duration_ms, status, applied_by)
         VALUES ($1, $2, $3, 'Success', $4)
         ON CONFLICT (filename) DO UPDATE
           SET checksum = EXCLUDED.checksum,
               duration_ms = EXCLUDED.duration_ms,
               status = 'Success',
               applied_at = now()`,
        [file, checksum, duration, process.env.USER || 'unknown'],
      );
      await client.query('COMMIT');
      console.log(`✅ ${file} completed in ${duration}ms`);
      appliedCount++;
    } catch (error: any) {
      const duration = Date.now() - startedAt;
      console.error(`❌ ${file} failed after ${duration}ms: ${error.message}`);
      if (error.detail) console.error(`   detail: ${error.detail}`);
      if (error.hint) console.error(`   hint: ${error.hint}`);
      if (error.position) console.error(`   position: ${error.position}`);

      try {
        await client.query('ROLLBACK');
      } catch {
        // Nothing was open (e.g. the failure happened in BEGIN itself).
      }

      // The file's changes were rolled back, so no history row is written and
      // the next run retries it. Abort the sequence: later migrations build on
      // this one.
      failures.push(file);
      if (!flags.continueOnError) {
        console.error(
          '\n🛑 Aborting: later migrations depend on this one. ' +
            'Re-run after fixing, or pass --continue-on-error to use the old lenient behaviour.',
        );
        break;
      }
    }
  }

  await client.end();

  if (failures.length > 0) {
    console.error(`\n💥 ${failures.length} migration(s) failed: ${failures.join(', ')}`);
    process.exit(1);
  }

  console.log(
    `\n🎉 Done - ${appliedCount} applied${flags.baseline ? ' (baseline)' : ''}${flags.dryRun ? ' (dry-run)' : ''}, ${skippedCount} already up to date.`,
  );
}

run().catch((e) => {
  console.error('💥 Migration runner crashed:', e);
  process.exit(1);
});

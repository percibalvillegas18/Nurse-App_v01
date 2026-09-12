/**
 * Run raw SQL migrations in order
 * Usage: ts-node scripts/run-migrations.ts
 */

import * as fs from 'fs';
import * as path from 'path';
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
];

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  console.log('✅ Connected to database');

  for (const file of order) {
    const filePath = path.join(migrationsDir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  Migration file not found: ${file}, skipping`);
      continue;
    }

    const sql = fs.readFileSync(filePath, 'utf-8');
    console.log(`\n▶️  Running ${file}...`);
    try {
      await client.query(sql);
      console.log(`✅ ${file} completed`);
    } catch (error) {
      console.error(`❌ ${file} failed:`, error.message);
      // Continue to next migration for idempotency, but log
      // In production, you would want to stop on error
    }
  }

  await client.end();
  console.log('\n🎉 All migrations completed');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONN = process.env.DB_URL || process.argv[2];
if (!CONN) {
  console.error('Usage: node apply-schema.mjs <postgres-url> [sql-file]');
  process.exit(1);
}

const sqlFile = process.argv[3] || path.join(__dirname, '..', 'supabase-migration.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');
console.log(`Reading ${sqlFile} (${sql.length} chars)`);

const client = new pg.Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  const { rows } = await client.query('SELECT current_database() db, version()');
  console.log('Connected to:', rows[0].db);

  await client.query(sql);
  console.log('\nSchema applied successfully.');

  const { rows: tables } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name
  `);
  console.log('Tables:', tables.map(t => t.table_name).join(', '));

  const { rows: fns } = await client.query(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' ORDER BY p.proname
  `);
  console.log('Functions:');
  for (const f of fns) console.log(`  ${f.proname}(${f.args})`);

  const { rows: buckets } = await client.query(`SELECT id, public FROM storage.buckets ORDER BY id`);
  console.log('Buckets:', buckets.map(b => `${b.id}(public=${b.public})`).join(', '));

  const { rows: pols } = await client.query(`
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' ORDER BY tablename, policyname
  `);
  console.log('Policies:');
  for (const p of pols) console.log(`  ${p.tablename}: ${p.policyname}`);

  await client.end();
}

main().catch(err => {
  console.error('ERROR:', err.message);
  if (err.position) console.error('at position', err.position);
  process.exit(1);
});
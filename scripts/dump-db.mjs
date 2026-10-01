import pg from 'pg';
import fs from 'fs';
import path from 'path';

const CONN = process.argv[2] || process.env.OLD_DB_URL;
if (!CONN) {
  console.error('Usage: node dump-db.mjs <postgres-url>');
  process.exit(1);
}

const OUT_DIR = process.argv[3] || path.resolve('db-dump');
fs.mkdirSync(OUT_DIR, { recursive: true });

const client = new pg.Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('Connected.');

  const { rows: tables } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log('Tables:', tables.map(t => t.table_name).join(', '));

  const dump = {};
  for (const { table_name } of tables) {
    const { rows } = await client.query(`SELECT * FROM public."${table_name}"`);
    dump[table_name] = rows;
    console.log(`  ${table_name}: ${rows.length} rows`);
  }

  const outFile = path.join(OUT_DIR, 'dump.json');
  fs.writeFileSync(outFile, JSON.stringify(dump, null, 2));
  console.log('\nWrote', outFile, `(${(fs.statSync(outFile).size / 1024 / 1024).toFixed(1)} MB)`);

  await client.end();
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
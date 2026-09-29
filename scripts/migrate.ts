/**
 * Apply supabase/migrations/*.sql in filename order to DATABASE_URL.
 * Tracks applied files in `schema_migrations`. (On Supabase you can also use
 * `supabase db push`; both read the same files.)
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const dir = path.join(process.cwd(), 'supabase', 'migrations');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = await readFile(path.join(dir, file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      console.log(`applied ${file}`);
    }
    console.log('migrations up to date');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

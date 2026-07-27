/**
 * Local PostgreSQL runner for development.
 *
 * Many contributors (and this project's own Windows dev box) do not have Docker
 * running, so `pnpm db:local` boots a genuine PostgreSQL server from the
 * `embedded-postgres` package instead. It is the *same* Postgres the app runs in
 * production, just supervised by Node, so the Prisma schema, enums, migrations
 * and raw SQL all behave identically.
 *
 * Data lives in `.pgdata/` (git-ignored) and survives restarts.
 *
 * Production/staging never uses this file — set DATABASE_URL to a managed
 * Postgres instance instead.
 */
import EmbeddedPostgres from 'embedded-postgres';
import path from 'node:path';

const PORT = Number(process.env.LOCAL_PG_PORT ?? 55432);
const USER = 'takeaway';
const PASSWORD = 'takeaway';
const DATABASE = 'takeaway';

async function main() {
  const dataDir = path.resolve(process.cwd(), '.pgdata');

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
    // Without this the cluster inherits the Windows ANSI codepage (WIN1252),
    // which cannot store `₹` or emoji. Production Postgres is UTF8; match it.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });

  const fs = await import('node:fs');
  const alreadyInitialised = fs.existsSync(path.join(dataDir, 'PG_VERSION'));

  if (!alreadyInitialised) {
    console.log('• Initialising a fresh PostgreSQL cluster in .pgdata …');
    await pg.initialise();
  }

  console.log(`• Starting PostgreSQL on port ${PORT} …`);
  await pg.start();

  if (!alreadyInitialised) {
    await pg.createDatabase(DATABASE);
  }

  const url = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}`;
  console.log('\n  PostgreSQL is running.\n');
  console.log(`  DATABASE_URL="${url}"\n`);
  console.log('  Leave this process running. Press Ctrl+C to stop.\n');

  const shutdown = async () => {
    console.log('\n• Stopping PostgreSQL …');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Failed to start local PostgreSQL:', error);
  process.exit(1);
});

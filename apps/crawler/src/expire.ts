/**
 * Mark stale jobs as expired. A job is considered expired when
 *   lastSeenAt + 7d < now
 * (i.e. it hasn't been re-seen by a list-page scrape in over a week).
 *
 * Idempotent: only flips rows that are NOT already expired.
 *
 * Run via GitHub Actions cron alongside the image crawler. The api just
 * reads `expiredAt` and surfaces an `expired: boolean` flag.
 */

import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const db = new Client({ connectionString: url });
  await db.connect();
  console.log('[db] connected');

  try {
    const res = await db.query<{ count: string }>(
      `
      UPDATE jobs
      SET "expiredAt" = now()
      WHERE "expiredAt" IS NULL
        AND "lastSeenAt" < now() - interval '7 days'
      RETURNING id
      `,
    );
    console.log(`[expire] flipped ${res.rowCount ?? 0} jobs to expired`);
  } finally {
    await db.end().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

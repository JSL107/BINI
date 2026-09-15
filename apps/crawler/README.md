# crawler

DB-write-only image crawler. Lives outside `apps/api` so the Vercel deployment
of the API never bundles Playwright or Chromium.

## Run locally

```bash
# 1) Install the workspace deps (root, once)
pnpm install

# 2) Install Chromium browser binary (once per machine)
pnpm --filter crawler exec playwright install chromium

# 3) Run a crawl (uses DATABASE_URL from env or apps/api/.env)
DATABASE_URL="postgresql://postgres:bini@localhost:5433/bini" pnpm --filter crawler crawl
```

After the crawl finishes, refresh the web — Google-quality results appear
from the `game_images` cache.

## GitHub Actions cron

`.github/workflows/refresh-images.yml` schedules this script periodically
(default: every 6 hours). It needs the `DATABASE_URL` secret on the repo.

## Configuration

| Env var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | (required) | Postgres connection (pooled OK) |
| `CRAWLER_CONCURRENCY` | `3` | Concurrent Google pages |
| `CRAWLER_MAX_QUERIES` | `500` | Per-run cap (politeness) |
| `CRAWLER_BATCH_SLEEP_MS` | `400` | Sleep between batches |
| `CRAWLER_PAGE_TIMEOUT_MS` | `15000` | Per-page navigation timeout |
| `CRAWLER_TIME_BUDGET_MS` | `900000` | Stop after this long; rest is picked up next run |
| `NAMUWIKI_TIME_BUDGET_MS` | `600000` | Same, for `crawl:namuwiki` |

## What it does

1. Reads from `jobs`: distinct `imageQuery` (for `imageQueryType='game'`) +
   `representativeGames` (UNNEST'd, `' 게임'` suffixed).
2. Picks targets via `src/crawl-policy.ts`: never-tried first; Google `found`/`not_found`
   are final; Google `blocked` retries after 3 days; Naver rows retry a Google upgrade
   after 7 days. A failed retry on a row that already has an image only bumps `fetchedAt`.
3. Writes results to `game_images` (`source='google-crawler'`, or `'naver'` when Google
   blocks and Naver finds one).

The API runtime never imports Playwright — it just reads this table.

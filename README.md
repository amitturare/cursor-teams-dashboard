# AI SparkLine

Next.js dashboard for **Cursor Team Admin API** metrics: per-user usage, efficiency, adoption, charts, and team settings. Data is backed by **PostgreSQL** (Drizzle ORM) for groups, settings, and synced usage history.

## Features

- User-level metrics over selectable windows (usage, productivity, agent/tab efficiency, adoption, favorite model, trends, overall score)
- Charts for AI acceptance and quota-style utilization (with in-app metric definitions)
- REST APIs for metrics, daily usage, events, audit logs, spend, groups, settings, and repo blocklists

## Metrics (short reference)

| Metric | Summary |
|--------|---------|
| Favorite model | Most frequent `mostUsedModel` in the window |
| Usage | Sum of `agentRequests + composerRequests + chatRequests + cmdkUsages` |
| Productivity | `(acceptedLinesAdded + acceptedLinesDeleted) / (agentRequests + composerRequests + chatRequests)` |
| Agent efficiency | `totalAccepts / agentRequests` |
| Tab efficiency | `totalTabsAccepted / totalTabsShown` |
| Adoption | Active days / days in window (`isActive`) |
| Overall score | Composite 0–100 (see in-app glossary) |

## Environment

Copy `.env.example` to `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `CURSOR_ADMIN_API_KEY` | Yes | Team Admin API key |
| `DATABASE_URL` | Yes\* | PostgreSQL URL for app data and sync |
| `CURSOR_API_BASE_URL` | No | Defaults to `https://api.cursor.com` |

\*Required for DB-backed features; the app may fall back to a local default in code if unset.

The database named in `DATABASE_URL` must **already exist**. Drizzle applies tables inside that database; it does **not** run `CREATE DATABASE`.

## Setup

**Quick path** (macOS/Linux with `psql` on your `PATH`, Postgres running):

```bash
cp .env.example .env
# Edit .env: CURSOR_ADMIN_API_KEY and DATABASE_URL

npm run setup
```

This runs `npm install`, creates the database named in `DATABASE_URL` if it does not exist, and runs `npm run db:migrate`.

**Manual path** — create the empty database yourself (Drizzle does not create it), then migrate:

```bash
createdb cursor_teams_dashboard   # name must match DATABASE_URL
set -a && source .env && set +a && npm run db:migrate
```

Verify tables: `psql "$DATABASE_URL" -c '\dt public.*'`.

```bash
npm run dev
```

Open http://localhost:3000.

### Schema changes

```bash
npm run db:generate   # new migration SQL from Drizzle schema
npm run db:migrate    # apply migrations
```

## API routes

| Method & path | Description |
|---------------|-------------|
| `GET /api/team-metrics?window=…` | Team metrics for a time window (`past-7d`, `past-30d`, `current-month`, etc.) |
| `GET /api/daily-usage` | Daily usage rows from the database |
| `GET /api/usage-events` | Usage events |
| `GET /api/audit-logs` | Audit logs |
| `GET /api/spend` | Team spend |
| `GET`, `POST /api/settings` | Team settings (`GET` needs `?key=…`) |
| `GET`, `POST /api/groups` | List or create groups |
| `GET`, `PATCH`, `DELETE /api/groups/[id]` | One group |
| `POST`, `DELETE /api/groups/[id]/members` | Group membership |
| `GET`, `POST /api/repo-blocklists` | Repo blocklists |
| `DELETE /api/repo-blocklists/[id]` | Delete a blocklist |

## Notes

- Daily usage requests to Cursor are limited to **30 days** per call; the app **chunks** longer ranges.
- Usage events are fetched with **pagination** and date ranges as needed.
- For **billing**, use usage-event level data and Cursor’s charged amounts—not all dashboard counters are billable units.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run setup` | Install deps, ensure DB exists, run migrations |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / start |
| `npm run typecheck` | TypeScript check |
| `npm run db:migrate` | Run Drizzle migrations |
| `npm run db:generate` | Generate migrations from `lib/db/schema.ts` |

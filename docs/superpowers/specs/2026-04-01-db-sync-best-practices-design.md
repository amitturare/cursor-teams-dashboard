# Design: PostgreSQL DB + Sync Layer + Best Practices
**Date:** 2026-04-01

## Overview

Add PostgreSQL (via Drizzle ORM) as a persistent data layer, implement a hybrid sync strategy (live for recent data, DB for historical), fix all identified technical debt, and apply Cursor API best practices throughout.

---

## Architecture

### Approach: DB as Persistent Cache with Gap-Filling (Approach A)

Next.js API routes stay surface-identical. A new `lib/db/` module handles all Postgres interactions. Each route calls a `syncAndQuery()` helper that performs:

1. **Gap detection** — check `sync_log` for which days in the requested range are missing or stale
2. **Selective fetch** — call Cursor API only for stale/missing date sub-ranges
3. **Upsert** — write fetched rows into DB, update `sync_log`
4. **Query** — read the full range from DB and return

Staleness rule: a day is considered stale if `synced_at < now() - 1 hour`. This matches the Cursor API's hourly aggregation cadence and enforces the docs' recommendation to poll at most once per hour.

---

## Database Schema (Drizzle + PostgreSQL)

### `daily_usage_rows` — typed columns for queryable metrics
```
id                      serial PK
user_email              text NOT NULL
date                    date NOT NULL
user_id                 integer
is_active               boolean
total_lines_added       integer
total_lines_deleted     integer
accepted_lines_added    integer
accepted_lines_deleted  integer
total_applies           integer
total_accepts           integer
total_rejects           integer
total_tabs_shown        integer
total_tabs_accepted     integer
composer_requests       integer
chat_requests           integer
agent_requests          integer
cmdk_usages             integer
subscription_reqs       integer
usage_based_reqs        integer
api_key_reqs            integer
bugbot_usages           integer
most_used_model         text
apply_ext               text
tab_ext                 text
client_version          text
synced_at               timestamptz NOT NULL
UNIQUE (user_email, date)
```

### `team_members` — authoritative member list
```
id          serial PK
cursor_id   text UNIQUE NOT NULL
email       text UNIQUE NOT NULL
name        text
role        text
is_removed  boolean DEFAULT false
synced_at   timestamptz NOT NULL
```

### `usage_events` — jsonb for variable event payloads
```
id          serial PK
user_email  text NOT NULL
timestamp   timestamptz NOT NULL
model       text
kind        text
data        jsonb NOT NULL
synced_at   timestamptz NOT NULL
UNIQUE (user_email, timestamp, model, kind)
```

### `audit_logs` — jsonb for variable log payloads
```
id          serial PK
user_email  text
event_type  text
timestamp   timestamptz NOT NULL
data        jsonb NOT NULL
synced_at   timestamptz NOT NULL
```

### `sync_log` — freshness tracking per day per data type
```
id          serial PK
data_type   text NOT NULL   -- 'daily_usage' | 'usage_events' | 'audit_logs' | 'team_members'
date        date NOT NULL
synced_at   timestamptz NOT NULL
UNIQUE (data_type, date)
```

### `team_spend` — per-user billing cycle spend
```
id                        serial PK
user_id                   integer UNIQUE NOT NULL
email                     text NOT NULL
name                      text
role                      text
spend_cents               integer NOT NULL DEFAULT 0
overall_spend_cents       integer NOT NULL DEFAULT 0
fast_premium_requests     integer NOT NULL DEFAULT 0
hard_limit_override_dollars integer NOT NULL DEFAULT 0
monthly_limit_dollars     integer
billing_cycle_start       timestamptz
synced_at                 timestamptz NOT NULL
```

### `user_groups` — replaces localStorage groups
```
id          serial PK
name        text NOT NULL
description text
color       text
created_at  timestamptz NOT NULL DEFAULT now()
updated_at  timestamptz NOT NULL DEFAULT now()
```

### `group_members`
```
id          serial PK
group_id    integer REFERENCES user_groups(id) ON DELETE CASCADE
email       text NOT NULL
UNIQUE (group_id, email)
```

---

## Sync Strategy

### Gap Detection Algorithm
```
function getStaleRanges(dataType, startDate, endDate):
  existing = SELECT date FROM sync_log
             WHERE data_type = dataType
               AND date BETWEEN startDate AND endDate
               AND synced_at > now() - interval '1 hour'
  allDays = eachDayInRange(startDate, endDate)
  staleDays = allDays - existing
  return mergeConsecutiveDays(staleDays)  // into minimal date ranges
```

### syncAndQuery() Flow
1. Call `getStaleRanges()`
2. For each stale range: call Cursor API, upsert rows, update sync_log
3. Query full range from DB
4. Return to API route

### Special case: team_members
Team members don't have a date dimension. Use `sync_log` with `date = CURRENT_DATE` and data_type = `'team_members'`. Re-fetch if older than 1 hour.

---

## File Structure

```
lib/
  db/
    index.ts          -- Drizzle client (singleton pg pool)
    schema.ts         -- All table definitions
    queries/
      daily-usage.ts  -- upsert + range queries for daily_usage_rows
      team-members.ts -- upsert + read for team_members
      usage-events.ts -- upsert + range queries for usage_events
      audit-logs.ts   -- upsert + range queries for audit_logs
      sync-log.ts     -- gap detection, mark synced
      groups.ts       -- CRUD for user_groups + group_members
  sync/
    daily-usage.ts    -- syncAndQuery for daily usage
    team-members.ts   -- syncAndQuery for team members
    usage-events.ts   -- syncAndQuery for usage events
    audit-logs.ts     -- syncAndQuery for audit logs
drizzle.config.ts
drizzle/migrations/   -- generated migration files
```

---

## API Routes

### Existing (modified)
- `GET /api/team-metrics` — calls `syncDailyUsage()` + `syncTeamMembers()`, reads from DB, builds metrics
- Cache TTL raised to **60 minutes** (from 5 min) to match hourly API cadence

### New routes
- `GET /api/spend` — per-user spend data for current billing cycle

### New routes (for groups, replacing localStorage)
- `GET /api/groups` — list all groups with members
- `POST /api/groups` — create group
- `PATCH /api/groups/[id]` — update name/description/color
- `DELETE /api/groups/[id]` — delete group
- `POST /api/groups/[id]/members` — add members
- `DELETE /api/groups/[id]/members` — remove members

---

## Technical Debt Fixed

| Debt | Fix |
|------|-----|
| Server cache TTL 5 min (too short) | Raise to 60 min; sync_log enforces hourly freshness |
| Double caching (client + server) | Client cache stays as UI perf layer; server no longer does redundant work |
| Missing DailyUsageRow fields | All fields added as typed columns in daily_usage_rows |
| `event_data` vs `details` ambiguity in AuditLogEntry | Store raw API response in `data` jsonb; fix interface to match docs |
| Dual field check `events ?? auditLogs` | Standardize to `events` field; log warning if `auditLogs` is seen |
| No 429 monitoring | Log all retry attempts with structured console output (timestamp, endpoint, attempt#) |
| `cache: "no-store"` on all fetches | Keep for Admin API (no ETag support); add ETag support scaffolding for Analytics/AI Code Tracking APIs |
| MAX_RETRIES = 4, docs recommend 5 | Raise to 5 |

---

## Best Practices Applied (from cursor-api-docs.md)

1. **Exponential backoff** — already implemented; MAX_RETRIES raised to 5
2. **Poll at most once per hour** — enforced via sync_log staleness check
3. **ETag caching scaffolding** — cursorRequest wrapper updated to accept/store ETags for future Analytics API use
4. **Batch wisely** — gap detection ensures only missing/stale ranges are fetched
5. **Monitor 429s** — structured retry logging added
6. **Handle errors gracefully** — 401/403 errors surface clearly to the UI

---

## Environment

Add to `.env`:
```
DATABASE_URL=postgresql://amitturare:root@localhost:5432/cursor_teams_dashboard
```

Add placeholder to `.env.example`:
```
DATABASE_URL=postgresql://username:password@localhost:5432/cursor_teams_dashboard
```

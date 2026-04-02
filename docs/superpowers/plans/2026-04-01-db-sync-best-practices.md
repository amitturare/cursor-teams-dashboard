# DB + Sync Layer + Best Practices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PostgreSQL + Drizzle as a persistent data layer with hybrid sync (live recent data, DB for historical), fix all technical debt, apply Cursor API best practices, and migrate user groups from localStorage to the database.

**Architecture:** A `syncAndQuery()` pattern sits between API routes and the Cursor API. Each data type has a DB query module (`lib/db/queries/`) and a sync module (`lib/sync/`). The sync layer detects stale/missing date ranges via `sync_log`, fetches only what's needed from Cursor, upserts into DB, then queries and returns from DB. API routes stay surface-identical.

**Tech Stack:** Next.js 16, Drizzle ORM, `pg` (node-postgres), PostgreSQL (local), Zod, TypeScript

---

## File Map

**Created:**
- `drizzle.config.ts` — Drizzle Kit config pointing to schema and migrations
- `lib/db/index.ts` — Drizzle client singleton (pg Pool)
- `lib/db/schema.ts` — All 7 table definitions
- `lib/db/queries/sync-log.ts` — Gap detection + mark synced
- `lib/db/queries/daily-usage.ts` — Upsert + range query for daily_usage_rows
- `lib/db/queries/team-members.ts` — Upsert + read for team_members
- `lib/db/queries/usage-events.ts` — Upsert + range query for usage_events
- `lib/db/queries/audit-logs.ts` — Upsert + range query for audit_logs
- `lib/db/queries/groups.ts` — Full CRUD for user_groups + group_members
- `lib/sync/daily-usage.ts` — syncAndQueryDailyUsage()
- `lib/sync/team-members.ts` — syncAndQueryTeamMembers()
- `lib/sync/usage-events.ts` — syncAndQueryUsageEvents()
- `lib/sync/audit-logs.ts` — syncAndQueryAuditLogs()
- `app/api/groups/route.ts` — GET list, POST create
- `app/api/groups/[id]/route.ts` — PATCH update, DELETE remove
- `app/api/groups/[id]/members/route.ts` — POST add members, DELETE remove members
- `drizzle/` — generated migration files (auto-created by drizzle-kit)

**Modified:**
- `lib/cursor-admin.ts` — Fix DailyUsageRow interface, MAX_RETRIES, audit log field naming, 429 logging, ETag scaffolding
- `app/api/team-metrics/route.ts` — Use sync functions, raise cache TTL to 60 min
- `app/api/usage-events/route.ts` (if exists) or new — Use sync functions
- `app/api/audit-logs/route.ts` (if exists) or new — Use sync functions
- `.env.example` — Add DATABASE_URL
- `components/dashboard.tsx` — Replace localStorage groups with /api/groups calls

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`
- Create: `.env` (update existing)
- Modify: `.env.example`

- [ ] **Step 1: Install Drizzle and pg**

```bash
npm install drizzle-orm pg
npm install --save-dev drizzle-kit @types/pg
```

Expected: packages added to `node_modules`, `package.json` updated.

- [ ] **Step 2: Add DATABASE_URL to .env.example**

In `.env.example`, add after the existing line:
```
CURSOR_ADMIN_API_KEY=your-cursor-admin-api-key-here
DATABASE_URL=postgresql://username:password@localhost:5432/cursor_teams_dashboard
```

- [ ] **Step 3: Add DATABASE_URL to your local .env**

```bash
# In .env (not committed)
echo "DATABASE_URL=postgresql://amitturare:root@localhost:5432/cursor_teams_dashboard" >> .env
```

- [ ] **Step 4: Verify the database exists**

```bash
psql -U amitturare -h localhost -p 5432 -l | grep cursor_teams_dashboard
```

Expected: `cursor_teams_dashboard` appears in the list. If not, create it:
```bash
createdb -U amitturare -h localhost -p 5432 cursor_teams_dashboard
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: same output as before (no new errors).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add drizzle-orm, pg dependencies"
```

---

## Task 2: Create Drizzle config and DB client

**Files:**
- Create: `drizzle.config.ts`
- Create: `lib/db/index.ts`

- [ ] **Step 1: Create `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://amitturare:root@localhost:5432/cursor_teams_dashboard"
  }
});
```

- [ ] **Step 2: Create `lib/db/index.ts`**

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgresql://amitturare:root@localhost:5432/cursor_teams_dashboard"
});

export const db = drizzle(pool, { schema });
export type DB = typeof db;
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add drizzle.config.ts lib/db/index.ts
git commit -m "chore: configure drizzle client and config"
```

---

## Task 3: Define database schema

**Files:**
- Create: `lib/db/schema.ts`

- [ ] **Step 1: Create `lib/db/schema.ts`**

```ts
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
  unique
} from "drizzle-orm/pg-core";

export const dailyUsageRows = pgTable(
  "daily_usage_rows",
  {
    id: serial("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    date: date("date").notNull(),
    userId: integer("user_id"),
    isActive: boolean("is_active"),
    totalLinesAdded: integer("total_lines_added"),
    totalLinesDeleted: integer("total_lines_deleted"),
    acceptedLinesAdded: integer("accepted_lines_added"),
    acceptedLinesDeleted: integer("accepted_lines_deleted"),
    totalApplies: integer("total_applies"),
    totalAccepts: integer("total_accepts"),
    totalRejects: integer("total_rejects"),
    totalTabsShown: integer("total_tabs_shown"),
    totalTabsAccepted: integer("total_tabs_accepted"),
    composerRequests: integer("composer_requests"),
    chatRequests: integer("chat_requests"),
    agentRequests: integer("agent_requests"),
    cmdkUsages: integer("cmdk_usages"),
    subscriptionReqs: integer("subscription_reqs"),
    usageBasedReqs: integer("usage_based_reqs"),
    apiKeyReqs: integer("api_key_reqs"),
    bugbotUsages: integer("bugbot_usages"),
    mostUsedModel: text("most_used_model"),
    applyExt: text("apply_ext"),
    tabExt: text("tab_ext"),
    clientVersion: text("client_version"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull()
  },
  (t) => [unique().on(t.userEmail, t.date)]
);

export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  cursorId: text("cursor_id").unique().notNull(),
  email: text("email").unique().notNull(),
  name: text("name"),
  role: text("role"),
  isRemoved: boolean("is_removed").default(false),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull()
});

export const usageEvents = pgTable(
  "usage_events",
  {
    id: serial("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    model: text("model"),
    kind: text("kind"),
    data: jsonb("data").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull()
  },
  (t) => [unique().on(t.userEmail, t.timestamp, t.model, t.kind)]
);

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email"),
  eventType: text("event_type"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  data: jsonb("data").notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull()
});

export const syncLog = pgTable(
  "sync_log",
  {
    id: serial("id").primaryKey(),
    dataType: text("data_type").notNull(),
    date: date("date").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull()
  },
  (t) => [unique().on(t.dataType, t.date)]
);

export const userGroups = pgTable("user_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const groupMembers = pgTable(
  "group_members",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .references(() => userGroups.id, { onDelete: "cascade" })
      .notNull(),
    email: text("email").notNull()
  },
  (t) => [unique().on(t.groupId, t.email)]
);
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat: define drizzle schema (7 tables)"
```

---

## Task 4: Generate and run initial migration

**Files:**
- Create: `drizzle/` (auto-generated)

- [ ] **Step 1: Generate migration**

```bash
npx drizzle-kit generate
```

Expected: `drizzle/0000_initial.sql` (or similar) created with CREATE TABLE statements for all 7 tables.

- [ ] **Step 2: Run migration**

```bash
npx drizzle-kit migrate
```

Expected: output like `Applying migration 0000_initial...` with no errors.

- [ ] **Step 3: Verify tables exist**

```bash
psql -U amitturare -h localhost -p 5432 cursor_teams_dashboard -c "\dt"
```

Expected: lists `audit_logs`, `daily_usage_rows`, `group_members`, `sync_log`, `team_members`, `usage_events`, `user_groups`.

- [ ] **Step 4: Commit**

```bash
git add drizzle/
git commit -m "feat: initial db migration — all 7 tables"
```

---

## Task 5: Fix technical debt in cursor-admin.ts

**Files:**
- Modify: `lib/cursor-admin.ts`

- [ ] **Step 1: Raise MAX_RETRIES to 5 and add retry logging**

In `lib/cursor-admin.ts`, change line 6:
```ts
const MAX_RETRIES = 5;
```

In the `cursorRequest` function, replace the retry block (around line 214):
```ts
if (response.status === 429 && attempt < MAX_RETRIES) {
  const delay = getRetryDelayMs(response, attempt);
  console.warn(
    `[cursor-api] 429 rate limited — endpoint: ${path}, attempt: ${attempt + 1}/${MAX_RETRIES}, retrying in ${delay}ms`
  );
  await sleep(delay);
  continue;
}
```

- [ ] **Step 2: Add ETag scaffolding to cursorRequest**

Replace the `JsonRequestOptions` type and `cursorRequest` signature in `lib/cursor-admin.ts`:

```ts
type JsonRequestOptions = Omit<RequestInit, "headers" | "body"> & {
  json?: unknown;
  searchParams?: Record<string, string | number | undefined>;
  etag?: string; // If-None-Match value from previous response
};

// Add to return type:
type CursorResponse<T> = { data: T; etag?: string };
```

Update `cursorRequest` to return `CursorResponse<T>` and handle 304:

```ts
async function cursorRequest<T>(
  path: string,
  options: JsonRequestOptions,
  schema: z.ZodType<T>
): Promise<CursorResponse<T>> {
  let url = `${getBaseUrl()}${path}`;

  if (options.searchParams) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(options.searchParams)) {
      if (v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const headers: Record<string, string> = {
      Authorization: buildAuthHeader(),
      "Content-Type": "application/json"
    };
    if (options.etag) {
      headers["If-None-Match"] = options.etag;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      body: options.json === undefined ? undefined : JSON.stringify(options.json),
      cache: "no-store"
    });

    if (response.status === 304) {
      // Data unchanged — caller should use cached value
      return { data: null as unknown as T, etag: options.etag };
    }

    if (response.ok) {
      const json = await response.json();
      const etag = response.headers.get("etag") ?? undefined;
      return { data: schema.parse(json), etag };
    }

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const delay = getRetryDelayMs(response, attempt);
      console.warn(
        `[cursor-api] 429 rate limited — endpoint: ${path}, attempt: ${attempt + 1}/${MAX_RETRIES}, retrying in ${delay}ms`
      );
      await sleep(delay);
      continue;
    }

    const body = await response.text();
    throw new Error(formatCursorErrorMessage(response.status, body));
  }

  throw new Error(`Cursor API ${path} failed after ${MAX_RETRIES} retries`);
}
```

- [ ] **Step 3: Update all callers of cursorRequest to destructure .data**

In `getTeamMembers()`:
```ts
export async function getTeamMembers(): Promise<TeamMember[]> {
  const { data } = await cursorRequest("/teams/members", { method: "GET" }, TeamMembersResponseSchema);
  return data.teamMembers;
}
```

In `getDailyUsageData()`, update each `cursorRequest` call:
```ts
const { data: response } = await cursorRequest(
  "/teams/daily-usage-data",
  { method: "POST", json: { startDate: chunk.startDate, endDate: chunk.endDate, page, pageSize } },
  DailyUsageResponseSchema
);
```

In `getUsageEvents()`, update:
```ts
const { data: response } = await cursorRequest(
  "/teams/filtered-usage-events",
  { method: "POST", json: { startDate: range.startDate, endDate: range.endDate, email: options?.email, page, pageSize } },
  UsageEventsResponseSchema
);
```

In `getAuditLogs()`, update:
```ts
const { data: response } = await cursorRequest(
  "/teams/audit-logs",
  { method: "GET", searchParams: { ... } },
  AuditLogsResponseSchema
);
```

In `getRepoBlocklists()`, `upsertRepoBlocklist()`, `deleteRepoBlocklist()`:
```ts
// getRepoBlocklists
const { data } = await cursorRequest("/settings/repo-blocklists/repos", { method: "GET" }, RepoBlocklistsResponseSchema);
return data.repos as RepoBlocklistEntry[];

// upsertRepoBlocklist
await cursorRequest("/settings/repo-blocklists/repos/upsert", { method: "POST", json: { repos: [{ url, patterns }] } }, UpsertRepoBlocklistResponseSchema);

// deleteRepoBlocklist
await cursorRequest(`/settings/repo-blocklists/repos/${encodeURIComponent(repoId)}`, { method: "DELETE" }, DeleteResponseSchema);
```

- [ ] **Step 4: Expand DailyUsageRow interface with all missing fields**

Replace the `DailyUsageRow` interface (lines 17–35):
```ts
export interface DailyUsageRow {
  date: number;
  email?: string;
  userId?: number;
  isActive?: boolean;
  totalLinesAdded?: number;
  totalLinesDeleted?: number;
  acceptedLinesAdded?: number;
  acceptedLinesDeleted?: number;
  totalApplies?: number;
  totalAccepts?: number;
  totalRejects?: number;
  totalTabsShown?: number;
  totalTabsAccepted?: number;
  composerRequests?: number;
  chatRequests?: number;
  agentRequests?: number;
  cmdkUsages?: number;
  subscriptionIncludedReqs?: number;
  usageBasedReqs?: number;
  apiKeyReqs?: number;
  bugbotUsages?: number;
  mostUsedModel?: string | null;
  applyMostUsedExtension?: string | null;
  tabMostUsedExtension?: string | null;
  clientVersion?: string | null;
}
```

- [ ] **Step 5: Expand DailyUsageResponseSchema to match**

Replace `DailyUsageResponseSchema` (lines 68–100):
```ts
const DailyUsageResponseSchema = z.object({
  data: z.array(
    z.object({
      date: z.number(),
      email: z.string().email().optional(),
      userId: z.number().optional(),
      isActive: z.boolean().optional(),
      totalLinesAdded: z.number().optional(),
      totalLinesDeleted: z.number().optional(),
      acceptedLinesAdded: z.number().optional(),
      acceptedLinesDeleted: z.number().optional(),
      totalApplies: z.number().optional(),
      totalAccepts: z.number().optional(),
      totalRejects: z.number().optional(),
      totalTabsShown: z.number().optional(),
      totalTabsAccepted: z.number().optional(),
      composerRequests: z.number().optional(),
      chatRequests: z.number().optional(),
      agentRequests: z.number().optional(),
      cmdkUsages: z.number().optional(),
      subscriptionIncludedReqs: z.number().optional(),
      usageBasedReqs: z.number().optional(),
      apiKeyReqs: z.number().optional(),
      bugbotUsages: z.number().optional(),
      mostUsedModel: z.string().optional().nullable(),
      applyMostUsedExtension: z.string().optional().nullable(),
      tabMostUsedExtension: z.string().optional().nullable(),
      clientVersion: z.string().optional().nullable()
    })
  ),
  pagination: z
    .object({
      page: z.number().optional(),
      pageSize: z.number().optional(),
      totalUsers: z.number().optional(),
      totalPages: z.number().optional(),
      hasNextPage: z.boolean().optional(),
      hasPreviousPage: z.boolean().optional()
    })
    .optional()
});
```

- [ ] **Step 6: Fix AuditLogEntry interface and schema to match API docs**

The API docs show the field is `event_data`, and the response top-level key is `events`. Fix the `AuditLogEntry` interface:
```ts
export interface AuditLogEntry {
  timestamp?: string;
  userEmail?: string;
  eventType?: string;
  eventData?: Record<string, unknown>;
}
```

Fix `AuditLogsResponseSchema` — standardize to `events`, add warning if `auditLogs` fallback is hit:
```ts
const AuditLogsResponseSchema = z.object({
  events: z
    .array(
      z
        .object({
          timestamp: z.string().optional(),
          user_email: z.string().optional(),
          event_type: z.string().optional(),
          event_data: z.record(z.string(), z.unknown()).optional()
        })
        .passthrough()
    )
    .optional(),
  auditLogs: z.array(z.unknown()).optional(), // legacy field — log warning if present
  pagination: z
    .object({
      hasNextPage: z.boolean().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
      totalCount: z.number().optional(),
      totalPages: z.number().optional()
    })
    .optional()
});
```

Update the entries extraction in `getAuditLogs()`:
```ts
if (response.auditLogs?.length) {
  console.warn("[cursor-api] Received legacy 'auditLogs' field — expected 'events'. Check API response.");
}
const entries = response.events ?? [];

for (const entry of entries) {
  const key = `${entry.timestamp ?? ""}::${entry.user_email ?? ""}::${entry.event_type ?? ""}`;
  if (seen.has(key)) continue;
  seen.add(key);
  allLogs.push({
    timestamp: entry.timestamp,
    userEmail: entry.user_email,
    eventType: entry.event_type,
    eventData: entry.event_data
  });
}
```

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/cursor-admin.ts
git commit -m "fix: cursor-admin tech debt — MAX_RETRIES=5, missing fields, audit log naming, 429 logging, ETag scaffolding"
```

---

## Task 6: Create sync-log query module

**Files:**
- Create: `lib/db/queries/sync-log.ts`

- [ ] **Step 1: Create `lib/db/queries/sync-log.ts`**

```ts
import { and, eq, gte, between, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { syncLog } from "@/lib/db/schema";

export type SyncDataType = "daily_usage" | "usage_events" | "audit_logs" | "team_members";

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

/** Returns date strings (YYYY-MM-DD) in the range that are missing or stale */
export async function getStaleDates(
  dataType: SyncDataType,
  startDate: number,
  endDate: number
): Promise<string[]> {
  const allDays = eachDayInRange(startDate, endDate);

  const freshRows = await db
    .select({ date: syncLog.date })
    .from(syncLog)
    .where(
      and(
        eq(syncLog.dataType, dataType),
        inArray(syncLog.date, allDays),
        gte(syncLog.syncedAt, new Date(Date.now() - STALE_THRESHOLD_MS))
      )
    );

  const freshSet = new Set(freshRows.map((r) => r.date));
  return allDays.filter((d) => !freshSet.has(d));
}

/** Marks a list of dates as freshly synced for a given data type */
export async function markSynced(dataType: SyncDataType, dates: string[]): Promise<void> {
  if (dates.length === 0) return;
  const now = new Date();
  await db
    .insert(syncLog)
    .values(dates.map((date) => ({ dataType, date, syncedAt: now })))
    .onConflictDoUpdate({
      target: [syncLog.dataType, syncLog.date],
      set: { syncedAt: now }
    });
}

/** Groups consecutive stale dates into minimal date ranges for API chunking */
export function groupIntoRanges(dates: string[]): Array<{ startDate: number; endDate: number }> {
  if (dates.length === 0) return [];

  const sorted = [...dates].sort();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const ranges: Array<{ startDate: number; endDate: number }> = [];

  let rangeStart = dateToMs(sorted[0]);
  let prev = rangeStart;

  for (let i = 1; i < sorted.length; i++) {
    const cur = dateToMs(sorted[i]);
    if (cur - prev > oneDayMs) {
      ranges.push({ startDate: rangeStart, endDate: prev + oneDayMs });
      rangeStart = cur;
    }
    prev = cur;
  }

  ranges.push({ startDate: rangeStart, endDate: prev + oneDayMs });
  return ranges;
}

function eachDayInRange(startMs: number, endMs: number): string[] {
  const days: string[] = [];
  const oneDayMs = 24 * 60 * 60 * 1000;
  let cur = startMs;
  while (cur < endMs) {
    days.push(new Date(cur).toISOString().slice(0, 10));
    cur += oneDayMs;
  }
  return days;
}

function dateToMs(dateStr: string): number {
  return new Date(dateStr + "T00:00:00Z").getTime();
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries/sync-log.ts
git commit -m "feat: sync-log gap detection and freshness tracking"
```

---

## Task 7: Create daily-usage DB query module

**Files:**
- Create: `lib/db/queries/daily-usage.ts`

- [ ] **Step 1: Create `lib/db/queries/daily-usage.ts`**

```ts
import { and, gte, lte, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyUsageRows } from "@/lib/db/schema";
import type { DailyUsageRow } from "@/lib/cursor-admin";

export async function upsertDailyUsageRows(rows: DailyUsageRow[]): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date();

  const values = rows
    .filter((r) => r.email)
    .map((r) => ({
      userEmail: r.email!,
      date: new Date(r.date).toISOString().slice(0, 10),
      userId: r.userId ?? null,
      isActive: r.isActive ?? null,
      totalLinesAdded: r.totalLinesAdded ?? null,
      totalLinesDeleted: r.totalLinesDeleted ?? null,
      acceptedLinesAdded: r.acceptedLinesAdded ?? null,
      acceptedLinesDeleted: r.acceptedLinesDeleted ?? null,
      totalApplies: r.totalApplies ?? null,
      totalAccepts: r.totalAccepts ?? null,
      totalRejects: r.totalRejects ?? null,
      totalTabsShown: r.totalTabsShown ?? null,
      totalTabsAccepted: r.totalTabsAccepted ?? null,
      composerRequests: r.composerRequests ?? null,
      chatRequests: r.chatRequests ?? null,
      agentRequests: r.agentRequests ?? null,
      cmdkUsages: r.cmdkUsages ?? null,
      subscriptionReqs: r.subscriptionIncludedReqs ?? null,
      usageBasedReqs: r.usageBasedReqs ?? null,
      apiKeyReqs: r.apiKeyReqs ?? null,
      bugbotUsages: r.bugbotUsages ?? null,
      mostUsedModel: r.mostUsedModel ?? null,
      applyExt: r.applyMostUsedExtension ?? null,
      tabExt: r.tabMostUsedExtension ?? null,
      clientVersion: r.clientVersion ?? null,
      syncedAt: now
    }));

  await db
    .insert(dailyUsageRows)
    .values(values)
    .onConflictDoUpdate({
      target: [dailyUsageRows.userEmail, dailyUsageRows.date],
      set: {
        userId: values[0].userId, // drizzle requires set; actual values come from excluded
        isActive: dailyUsageRows.isActive,
        totalLinesAdded: dailyUsageRows.totalLinesAdded,
        totalLinesDeleted: dailyUsageRows.totalLinesDeleted,
        acceptedLinesAdded: dailyUsageRows.acceptedLinesAdded,
        acceptedLinesDeleted: dailyUsageRows.acceptedLinesDeleted,
        totalApplies: dailyUsageRows.totalApplies,
        totalAccepts: dailyUsageRows.totalAccepts,
        totalRejects: dailyUsageRows.totalRejects,
        totalTabsShown: dailyUsageRows.totalTabsShown,
        totalTabsAccepted: dailyUsageRows.totalTabsAccepted,
        composerRequests: dailyUsageRows.composerRequests,
        chatRequests: dailyUsageRows.chatRequests,
        agentRequests: dailyUsageRows.agentRequests,
        cmdkUsages: dailyUsageRows.cmdkUsages,
        subscriptionReqs: dailyUsageRows.subscriptionReqs,
        usageBasedReqs: dailyUsageRows.usageBasedReqs,
        apiKeyReqs: dailyUsageRows.apiKeyReqs,
        bugbotUsages: dailyUsageRows.bugbotUsages,
        mostUsedModel: dailyUsageRows.mostUsedModel,
        applyExt: dailyUsageRows.applyExt,
        tabExt: dailyUsageRows.tabExt,
        clientVersion: dailyUsageRows.clientVersion,
        syncedAt: now
      }
    });
}

export async function queryDailyUsageRows(startDate: number, endDate: number): Promise<DailyUsageRow[]> {
  const startStr = new Date(startDate).toISOString().slice(0, 10);
  const endStr = new Date(endDate - 1).toISOString().slice(0, 10); // endDate is exclusive

  const rows = await db
    .select()
    .from(dailyUsageRows)
    .where(and(gte(dailyUsageRows.date, startStr), lte(dailyUsageRows.date, endStr)));

  return rows.map((r) => ({
    date: new Date(r.date + "T00:00:00Z").getTime(),
    email: r.userEmail,
    userId: r.userId ?? undefined,
    isActive: r.isActive ?? undefined,
    totalLinesAdded: r.totalLinesAdded ?? undefined,
    totalLinesDeleted: r.totalLinesDeleted ?? undefined,
    acceptedLinesAdded: r.acceptedLinesAdded ?? undefined,
    acceptedLinesDeleted: r.acceptedLinesDeleted ?? undefined,
    totalApplies: r.totalApplies ?? undefined,
    totalAccepts: r.totalAccepts ?? undefined,
    totalRejects: r.totalRejects ?? undefined,
    totalTabsShown: r.totalTabsShown ?? undefined,
    totalTabsAccepted: r.totalTabsAccepted ?? undefined,
    composerRequests: r.composerRequests ?? undefined,
    chatRequests: r.chatRequests ?? undefined,
    agentRequests: r.agentRequests ?? undefined,
    cmdkUsages: r.cmdkUsages ?? undefined,
    subscriptionIncludedReqs: r.subscriptionReqs ?? undefined,
    usageBasedReqs: r.usageBasedReqs ?? undefined,
    apiKeyReqs: r.apiKeyReqs ?? undefined,
    bugbotUsages: r.bugbotUsages ?? undefined,
    mostUsedModel: r.mostUsedModel ?? undefined,
    applyMostUsedExtension: r.applyExt ?? undefined,
    tabMostUsedExtension: r.tabExt ?? undefined,
    clientVersion: r.clientVersion ?? undefined
  }));
}
```

**Note on `onConflictDoUpdate`:** Drizzle's conflict update requires referencing the actual column objects so PostgreSQL uses `EXCLUDED.*` values. The `set` block above will be corrected in the next step using Drizzle's `sql` helper for excluded values.

- [ ] **Step 2: Fix upsert to use sql`excluded` values properly**

The `onConflictDoUpdate` set block should use the incoming values. Replace the set block with:
```ts
import { sql } from "drizzle-orm";

// In the .onConflictDoUpdate set:
set: {
  userId: sql`excluded.user_id`,
  isActive: sql`excluded.is_active`,
  totalLinesAdded: sql`excluded.total_lines_added`,
  totalLinesDeleted: sql`excluded.total_lines_deleted`,
  acceptedLinesAdded: sql`excluded.accepted_lines_added`,
  acceptedLinesDeleted: sql`excluded.accepted_lines_deleted`,
  totalApplies: sql`excluded.total_applies`,
  totalAccepts: sql`excluded.total_accepts`,
  totalRejects: sql`excluded.total_rejects`,
  totalTabsShown: sql`excluded.total_tabs_shown`,
  totalTabsAccepted: sql`excluded.total_tabs_accepted`,
  composerRequests: sql`excluded.composer_requests`,
  chatRequests: sql`excluded.chat_requests`,
  agentRequests: sql`excluded.agent_requests`,
  cmdkUsages: sql`excluded.cmdk_usages`,
  subscriptionReqs: sql`excluded.subscription_reqs`,
  usageBasedReqs: sql`excluded.usage_based_reqs`,
  apiKeyReqs: sql`excluded.api_key_reqs`,
  bugbotUsages: sql`excluded.bugbot_usages`,
  mostUsedModel: sql`excluded.most_used_model`,
  applyExt: sql`excluded.apply_ext`,
  tabExt: sql`excluded.tab_ext`,
  clientVersion: sql`excluded.client_version`,
  syncedAt: sql`excluded.synced_at`
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/db/queries/daily-usage.ts
git commit -m "feat: daily-usage DB query module (upsert + range query)"
```

---

## Task 8: Create team-members DB query module

**Files:**
- Create: `lib/db/queries/team-members.ts`

- [ ] **Step 1: Create `lib/db/queries/team-members.ts`**

```ts
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { teamMembers } from "@/lib/db/schema";
import type { TeamMember } from "@/lib/cursor-admin";

export async function upsertTeamMembers(members: TeamMember[]): Promise<void> {
  if (members.length === 0) return;
  const now = new Date();

  await db
    .insert(teamMembers)
    .values(
      members.map((m) => ({
        cursorId: String(m.id),
        email: m.email,
        name: m.name ?? null,
        role: m.role ?? null,
        isRemoved: m.isRemoved ?? false,
        syncedAt: now
      }))
    )
    .onConflictDoUpdate({
      target: teamMembers.email,
      set: {
        cursorId: sql`excluded.cursor_id`,
        name: sql`excluded.name`,
        role: sql`excluded.role`,
        isRemoved: sql`excluded.is_removed`,
        syncedAt: sql`excluded.synced_at`
      }
    });
}

export async function queryTeamMembers(): Promise<TeamMember[]> {
  const rows = await db.select().from(teamMembers);
  return rows.map((r) => ({
    id: r.cursorId,
    email: r.email,
    name: r.name ?? undefined,
    role: r.role ?? undefined,
    isRemoved: r.isRemoved ?? false
  }));
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries/team-members.ts
git commit -m "feat: team-members DB query module"
```

---

## Task 9: Create usage-events DB query module

**Files:**
- Create: `lib/db/queries/usage-events.ts`

- [ ] **Step 1: Create `lib/db/queries/usage-events.ts`**

```ts
import { and, gte, lte, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { usageEvents } from "@/lib/db/schema";
import type { UsageEvent } from "@/lib/cursor-admin";

export async function upsertUsageEvents(events: UsageEvent[]): Promise<void> {
  if (events.length === 0) return;
  const now = new Date();

  const values = events
    .filter((e) => e.userEmail && e.timestamp)
    .map((e) => ({
      userEmail: e.userEmail!,
      timestamp: new Date(Number(e.timestamp)),
      model: e.model ?? null,
      kind: e.kind ?? null,
      data: e as Record<string, unknown>,
      syncedAt: now
    }));

  if (values.length === 0) return;

  await db
    .insert(usageEvents)
    .values(values)
    .onConflictDoUpdate({
      target: [usageEvents.userEmail, usageEvents.timestamp, usageEvents.model, usageEvents.kind],
      set: {
        data: sql`excluded.data`,
        syncedAt: sql`excluded.synced_at`
      }
    });
}

export async function queryUsageEvents(
  startDate: number,
  endDate: number,
  email?: string
): Promise<UsageEvent[]> {
  const conditions = [
    gte(usageEvents.timestamp, new Date(startDate)),
    lte(usageEvents.timestamp, new Date(endDate))
  ];
  if (email) conditions.push(eq(usageEvents.userEmail, email));

  const rows = await db
    .select()
    .from(usageEvents)
    .where(and(...conditions));

  return rows.map((r) => ({
    ...(r.data as object),
    userEmail: r.userEmail,
    timestamp: r.timestamp.getTime().toString(),
    model: r.model ?? undefined,
    kind: r.kind ?? undefined
  })) as UsageEvent[];
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries/usage-events.ts
git commit -m "feat: usage-events DB query module"
```

---

## Task 10: Create audit-logs DB query module

**Files:**
- Create: `lib/db/queries/audit-logs.ts`

- [ ] **Step 1: Create `lib/db/queries/audit-logs.ts`**

```ts
import { and, gte, lte, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import type { AuditLogEntry } from "@/lib/cursor-admin";

export async function upsertAuditLogs(logs: AuditLogEntry[]): Promise<void> {
  if (logs.length === 0) return;
  const now = new Date();

  const values = logs
    .filter((l) => l.timestamp)
    .map((l) => ({
      userEmail: l.userEmail ?? null,
      eventType: l.eventType ?? null,
      timestamp: new Date(l.timestamp!),
      data: l as Record<string, unknown>,
      syncedAt: now
    }));

  if (values.length === 0) return;

  // audit logs are append-only — insert and ignore duplicates
  await db.insert(auditLogs).values(values).onConflictDoNothing();
}

export async function queryAuditLogs(
  startDate: number,
  endDate: number,
  options?: { email?: string; eventType?: string }
): Promise<AuditLogEntry[]> {
  const conditions = [
    gte(auditLogs.timestamp, new Date(startDate)),
    lte(auditLogs.timestamp, new Date(endDate))
  ];
  if (options?.email) conditions.push(eq(auditLogs.userEmail, options.email));
  if (options?.eventType) conditions.push(eq(auditLogs.eventType, options.eventType));

  const rows = await db
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(auditLogs.timestamp);

  return rows.map((r) => ({
    timestamp: r.timestamp.toISOString(),
    userEmail: r.userEmail ?? undefined,
    eventType: r.eventType ?? undefined,
    eventData: (r.data as AuditLogEntry).eventData
  }));
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries/audit-logs.ts
git commit -m "feat: audit-logs DB query module"
```

---

## Task 11: Create groups DB query module

**Files:**
- Create: `lib/db/queries/groups.ts`

- [ ] **Step 1: Create `lib/db/queries/groups.ts`**

```ts
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { userGroups, groupMembers } from "@/lib/db/schema";

export interface Group {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
  members: string[]; // emails
}

export async function listGroups(): Promise<Group[]> {
  const groups = await db.select().from(userGroups).orderBy(userGroups.name);
  if (groups.length === 0) return [];

  const members = await db
    .select()
    .from(groupMembers)
    .where(inArray(groupMembers.groupId, groups.map((g) => g.id)));

  const membersByGroup = new Map<number, string[]>();
  for (const m of members) {
    const list = membersByGroup.get(m.groupId) ?? [];
    list.push(m.email);
    membersByGroup.set(m.groupId, list);
  }

  return groups.map((g) => ({
    ...g,
    members: membersByGroup.get(g.id) ?? []
  }));
}

export async function getGroup(id: number): Promise<Group | null> {
  const [group] = await db.select().from(userGroups).where(eq(userGroups.id, id));
  if (!group) return null;

  const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, id));
  return { ...group, members: members.map((m) => m.email) };
}

export async function createGroup(data: { name: string; description?: string; color?: string }): Promise<Group> {
  const [group] = await db
    .insert(userGroups)
    .values({ name: data.name, description: data.description ?? null, color: data.color ?? null })
    .returning();
  return { ...group, members: [] };
}

export async function updateGroup(
  id: number,
  data: { name?: string; description?: string | null; color?: string | null }
): Promise<Group | null> {
  const updates: Partial<typeof userGroups.$inferInsert> = {
    updatedAt: new Date()
  };
  if (data.name !== undefined) updates.name = data.name;
  if ("description" in data) updates.description = data.description ?? null;
  if ("color" in data) updates.color = data.color ?? null;

  const [group] = await db.update(userGroups).set(updates).where(eq(userGroups.id, id)).returning();
  if (!group) return null;

  const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, id));
  return { ...group, members: members.map((m) => m.email) };
}

export async function deleteGroup(id: number): Promise<void> {
  await db.delete(userGroups).where(eq(userGroups.id, id));
}

export async function addGroupMembers(groupId: number, emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  await db
    .insert(groupMembers)
    .values(emails.map((email) => ({ groupId, email })))
    .onConflictDoNothing();
}

export async function removeGroupMembers(groupId: number, emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  await db
    .delete(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), inArray(groupMembers.email, emails)));
}
```

Add the missing import at the top:
```ts
import { eq, inArray, sql, and } from "drizzle-orm";
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries/groups.ts
git commit -m "feat: groups DB query module (full CRUD)"
```

---

## Task 12: Create sync layer — daily usage

**Files:**
- Create: `lib/sync/daily-usage.ts`

- [ ] **Step 1: Create `lib/sync/daily-usage.ts`**

```ts
import { getDailyUsageData } from "@/lib/cursor-admin";
import { upsertDailyUsageRows, queryDailyUsageRows } from "@/lib/db/queries/daily-usage";
import { getStaleDates, groupIntoRanges, markSynced } from "@/lib/db/queries/sync-log";
import type { DailyUsageRow } from "@/lib/cursor-admin";

export async function syncAndQueryDailyUsage(startDate: number, endDate: number): Promise<DailyUsageRow[]> {
  const staleDates = await getStaleDates("daily_usage", startDate, endDate);

  if (staleDates.length > 0) {
    const ranges = groupIntoRanges(staleDates);

    for (const range of ranges) {
      const rows = await getDailyUsageData(range.startDate, range.endDate);
      await upsertDailyUsageRows(rows);
    }

    await markSynced("daily_usage", staleDates);
  }

  return queryDailyUsageRows(startDate, endDate);
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/sync/daily-usage.ts
git commit -m "feat: daily-usage sync layer (gap detection + upsert)"
```

---

## Task 13: Create sync layer — team members

**Files:**
- Create: `lib/sync/team-members.ts`

- [ ] **Step 1: Create `lib/sync/team-members.ts`**

```ts
import { getTeamMembers } from "@/lib/cursor-admin";
import { upsertTeamMembers, queryTeamMembers } from "@/lib/db/queries/team-members";
import { getStaleDates, markSynced } from "@/lib/db/queries/sync-log";
import type { TeamMember } from "@/lib/cursor-admin";

const TODAY = () => new Date().toISOString().slice(0, 10);

export async function syncAndQueryTeamMembers(): Promise<TeamMember[]> {
  const today = new Date();
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  const staleDates = await getStaleDates("team_members", todayMs, todayMs + 24 * 60 * 60 * 1000);

  if (staleDates.length > 0) {
    const members = await getTeamMembers();
    await upsertTeamMembers(members);
    await markSynced("team_members", staleDates);
  }

  return queryTeamMembers();
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/sync/team-members.ts
git commit -m "feat: team-members sync layer"
```

---

## Task 14: Create sync layer — usage events and audit logs

**Files:**
- Create: `lib/sync/usage-events.ts`
- Create: `lib/sync/audit-logs.ts`

- [ ] **Step 1: Create `lib/sync/usage-events.ts`**

```ts
import { getUsageEvents } from "@/lib/cursor-admin";
import { upsertUsageEvents, queryUsageEvents } from "@/lib/db/queries/usage-events";
import { getStaleDates, groupIntoRanges, markSynced } from "@/lib/db/queries/sync-log";
import type { UsageEvent } from "@/lib/cursor-admin";

export async function syncAndQueryUsageEvents(
  startDate: number,
  endDate: number,
  options?: { email?: string }
): Promise<UsageEvent[]> {
  const staleDates = await getStaleDates("usage_events", startDate, endDate);

  if (staleDates.length > 0) {
    const ranges = groupIntoRanges(staleDates);
    for (const range of ranges) {
      const events = await getUsageEvents(range.startDate, range.endDate, options);
      await upsertUsageEvents(events);
    }
    await markSynced("usage_events", staleDates);
  }

  return queryUsageEvents(startDate, endDate, options?.email);
}
```

- [ ] **Step 2: Create `lib/sync/audit-logs.ts`**

```ts
import { getAuditLogs } from "@/lib/cursor-admin";
import { upsertAuditLogs, queryAuditLogs } from "@/lib/db/queries/audit-logs";
import { getStaleDates, groupIntoRanges, markSynced } from "@/lib/db/queries/sync-log";
import type { AuditLogEntry } from "@/lib/cursor-admin";

export async function syncAndQueryAuditLogs(
  startDate: number,
  endDate: number,
  options?: { search?: string; eventTypes?: string[]; users?: string[] }
): Promise<AuditLogEntry[]> {
  const staleDates = await getStaleDates("audit_logs", startDate, endDate);

  if (staleDates.length > 0) {
    const ranges = groupIntoRanges(staleDates);
    for (const range of ranges) {
      const logs = await getAuditLogs(range.startDate, range.endDate, options);
      await upsertAuditLogs(logs);
    }
    await markSynced("audit_logs", staleDates);
  }

  return queryAuditLogs(startDate, endDate);
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/sync/usage-events.ts lib/sync/audit-logs.ts
git commit -m "feat: usage-events and audit-logs sync layers"
```

---

## Task 15: Update /api/team-metrics to use sync layer

**Files:**
- Modify: `app/api/team-metrics/route.ts`

- [ ] **Step 1: Replace direct Cursor API calls and raise cache TTL**

Replace the entire content of `app/api/team-metrics/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { buildUserWindowMetrics, getSelectableWindows, resolveWindowSelection } from "@/lib/metrics";
import { syncAndQueryDailyUsage } from "@/lib/sync/daily-usage";
import { syncAndQueryTeamMembers } from "@/lib/sync/team-members";

const QuerySchema = z.object({
  window: z.string().optional()
});

export const dynamic = "force-dynamic";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — matches Cursor API's hourly aggregation cadence

type MetricRows = ReturnType<typeof buildUserWindowMetrics>;

type MetricDefinition = {
  name: string;
  tagline: string;
  formula: string;
  source: string;
  interpret: string;
};

type CachedMetricsResponse = {
  generatedAt: string;
  definitions: MetricDefinition[];
  rows: MetricRows;
  availableWindows: Array<{ id: string; label: string }>;
  selectedWindow: { id: string; label: string; startDate: number; endDate: number };
  cached?: boolean;
};

const metricsCache = new Map<string, { expiresAt: number; value: CachedMetricsResponse }>();

export async function GET(request: NextRequest) {
  try {
    const query = QuerySchema.parse({
      window: request.nextUrl.searchParams.get("window") || undefined
    });

    const selectedWindow = resolveWindowSelection(query.window);
    const cacheKey = `window:${selectedWindow.id}`;
    const cached = metricsCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ ...cached.value, cached: true });
    }

    const [teamMembers, dailyUsageData] = await Promise.all([
      syncAndQueryTeamMembers(),
      syncAndQueryDailyUsage(selectedWindow.startDate, selectedWindow.endDate)
    ]);

    const rows = buildUserWindowMetrics({ teamMembers, dailyUsageData, window: selectedWindow });

    const payload: CachedMetricsResponse = {
      generatedAt: new Date().toISOString(),
      definitions: [
        {
          name: "Favorite Model",
          tagline: "The AI model this user relied on most during the selected period",
          formula: "Most frequently appearing model across all daily rows in the window",
          source: "mostUsedModel field from the Cursor /teams/daily-usage-data API, recorded per user per day",
          interpret:
            "'default' means Cursor auto-selected the model. Named models (e.g. claude-4-sonnet-thinking, gpt-4o) mean the user explicitly switched. A user always showing 'default' is letting Cursor decide; a named model indicates intentional preference."
        },
        {
          name: "Usage",
          tagline: "Total number of AI interactions made during the selected window",
          formula: "agentRequests + composerRequests + chatRequests + cmdkUsages, summed across all days",
          source:
            "Four daily counters from /teams/daily-usage-data: Agent (multi-step tasks), Composer (inline generation), Chat (messages), Cmd+K (quick completions)",
          interpret:
            "The clearest signal of AI engagement. Higher = more interactions. Does not measure code quality or acceptance — just how much the user reached for AI assistance."
        },
        {
          name: "Productivity Score",
          tagline: "Lines of AI-suggested code accepted per request — did the AI save real work?",
          formula: "(acceptedLinesAdded + acceptedLinesDeleted) ÷ (agentRequests + composerRequests + chatRequests)",
          source: "acceptedLinesAdded, acceptedLinesDeleted, and request counts from /teams/daily-usage-data",
          interpret:
            "A score of 34 means ~34 lines of AI output were kept per request on average. 0 means requests were made but nothing was accepted. Scores above 50 are strong; very high scores (100+) often come from Agent mode scaffolding large files."
        },
        {
          name: "Agent Efficiency",
          tagline: "How often the user kept the Agent's output — a signal of agent trust and quality",
          formula: "totalAccepts ÷ agentRequests × 100",
          source: "totalAccepts and agentRequests fields from /teams/daily-usage-data",
          interpret:
            "67% means the agent's result was accepted 2 out of 3 times. Under 30% often means exploratory use or the agent isn't aligned to the codebase style. High efficiency (70%+) suggests the user and agent work well together."
        },
        {
          name: "Tab Efficiency",
          tagline: "How often Tab (autocomplete) suggestions were accepted when shown",
          formula: "totalTabsAccepted ÷ totalTabsShown × 100",
          source: "totalTabsAccepted and totalTabsShown fields from /teams/daily-usage-data",
          interpret:
            "Autocomplete fires on every keypress, so rates are naturally lower than Agent efficiency. 10–15% is typical; above 25% is excellent. Very low rates (<5%) may mean the user dismisses suggestions habitually or the model isn't well-calibrated to their style."
        },
        {
          name: "Adoption Rate",
          tagline: "How consistently the user engaged with Cursor AI across the window — daily habit vs. occasional use",
          formula: "Days where isActive = true ÷ total days in window × 100",
          source:
            "isActive boolean field from /teams/daily-usage-data — true when the user made at least one AI request that day",
          interpret:
            "100% means AI was used every single day. 43% on a 7-day window means 3 active days. A user can have high Usage but low Adoption (heavy use on select days) — the Trend sparkline in the table shows the day-by-day pattern."
        }
      ],
      rows,
      availableWindows: getSelectableWindows().map((w) => ({ id: w.id, label: w.label })),
      selectedWindow: {
        id: selectedWindow.id,
        label: selectedWindow.label,
        startDate: selectedWindow.startDate,
        endDate: selectedWindow.endDate
      }
    };

    metricsCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: payload });
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { error: message, hint: "Verify CURSOR_ADMIN_API_KEY and DATABASE_URL are set correctly" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Start dev server and verify dashboard loads**

```bash
npm run dev
```

Open `http://localhost:3000` — dashboard should load. First load will sync from Cursor API into DB. Check logs for `[cursor-api]` output. Second load within 1 hour should be served from DB with `cached: true`.

- [ ] **Step 4: Commit**

```bash
git add app/api/team-metrics/route.ts
git commit -m "feat: team-metrics route uses sync layer, cache TTL 60min"
```

---

## Task 16: Create Groups API routes

**Files:**
- Create: `app/api/groups/route.ts`
- Create: `app/api/groups/[id]/route.ts`
- Create: `app/api/groups/[id]/members/route.ts`

- [ ] **Step 1: Create `app/api/groups/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listGroups, createGroup } from "@/lib/db/queries/groups";

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
});

export async function GET() {
  try {
    const groups = await listGroups();
    return NextResponse.json({ groups });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = CreateGroupSchema.parse(await request.json());
    const group = await createGroup(body);
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `app/api/groups/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getGroup, updateGroup, deleteGroup } from "@/lib/db/queries/groups";

const UpdateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional()
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const group = await getGroup(Number(id));
    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
    return NextResponse.json({ group });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = UpdateGroupSchema.parse(await request.json());
    const group = await updateGroup(Number(id), body);
    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
    return NextResponse.json({ group });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteGroup(Number(id));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create `app/api/groups/[id]/members/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addGroupMembers, removeGroupMembers, getGroup } from "@/lib/db/queries/groups";

const MembersSchema = z.object({
  emails: z.array(z.string().email()).min(1)
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const groupId = Number(id);
    const existing = await getGroup(groupId);
    if (!existing) return NextResponse.json({ error: "Group not found" }, { status: 404 });

    const { emails } = MembersSchema.parse(await request.json());
    await addGroupMembers(groupId, emails);
    const updated = await getGroup(groupId);
    return NextResponse.json({ group: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const groupId = Number(id);
    const existing = await getGroup(groupId);
    if (!existing) return NextResponse.json({ error: "Group not found" }, { status: 404 });

    const { emails } = MembersSchema.parse(await request.json());
    await removeGroupMembers(groupId, emails);
    const updated = await getGroup(groupId);
    return NextResponse.json({ group: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/groups/
git commit -m "feat: groups API routes (CRUD + members)"
```

---

## Task 17: Migrate dashboard groups from localStorage to /api/groups

**Files:**
- Modify: `components/dashboard.tsx`

- [ ] **Step 1: Find and read the groups localStorage code in dashboard.tsx**

Search for all references to `cursor-dashboard-user-groups` and `localStorage` in `components/dashboard.tsx`. These will be concentrated in:
- An initial `useEffect` that reads from localStorage
- A save effect that writes to localStorage on group changes
- Any direct `localStorage.getItem`/`setItem` calls

- [ ] **Step 2: Replace localStorage group loading with API fetch**

Find the `useEffect` that loads groups from localStorage (pattern: `localStorage.getItem("cursor-dashboard-user-groups")`). Replace it with an API fetch:

```ts
// Replace the localStorage load effect with:
useEffect(() => {
  fetch("/api/groups")
    .then((r) => r.json())
    .then((data: { groups: Array<{ id: number; name: string; description: string | null; color: string | null; members: string[] }> }) => {
      if (data.groups) {
        setUserGroups(
          data.groups.map((g) => ({
            id: String(g.id),
            name: g.name,
            description: g.description ?? undefined,
            color: g.color ?? undefined,
            members: g.members
          }))
        );
      }
    })
    .catch((err) => console.error("Failed to load groups:", err));
}, []);
```

- [ ] **Step 3: Replace localStorage group save with API calls**

Find any `localStorage.setItem("cursor-dashboard-user-groups", ...)` calls and the group create/update/delete handlers. Replace the save logic:

For **create group** (wherever a new group is added):
```ts
async function handleCreateGroup(name: string, description?: string, color?: string) {
  const res = await fetch("/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, color })
  });
  const data = await res.json();
  if (res.ok) {
    setUserGroups((prev) => [
      ...prev,
      { id: String(data.group.id), name: data.group.name, description: data.group.description ?? undefined, color: data.group.color ?? undefined, members: data.group.members }
    ]);
  }
}
```

For **update group**:
```ts
async function handleUpdateGroup(id: string, updates: { name?: string; description?: string | null; color?: string | null }) {
  const res = await fetch(`/api/groups/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates)
  });
  const data = await res.json();
  if (res.ok) {
    setUserGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates, members: data.group.members } : g)));
  }
}
```

For **delete group**:
```ts
async function handleDeleteGroup(id: string) {
  await fetch(`/api/groups/${id}`, { method: "DELETE" });
  setUserGroups((prev) => prev.filter((g) => g.id !== id));
}
```

For **add/remove members**:
```ts
async function handleAddMembers(groupId: string, emails: string[]) {
  const res = await fetch(`/api/groups/${groupId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emails })
  });
  const data = await res.json();
  if (res.ok) {
    setUserGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, members: data.group.members } : g)));
  }
}

async function handleRemoveMembers(groupId: string, emails: string[]) {
  const res = await fetch(`/api/groups/${groupId}/members`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emails })
  });
  const data = await res.json();
  if (res.ok) {
    setUserGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, members: data.group.members } : g)));
  }
}
```

- [ ] **Step 4: Remove all remaining localStorage references for groups**

Search for and remove any remaining `localStorage.setItem("cursor-dashboard-user-groups"` or `localStorage.getItem("cursor-dashboard-user-groups"` calls.

```bash
grep -n "cursor-dashboard-user-groups" components/dashboard.tsx
```

Expected: no matches after cleanup.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Verify groups work end-to-end**

With `npm run dev` running:
1. Open `http://localhost:3000`
2. Create a group — verify it persists after browser refresh
3. Add a member — verify member appears after refresh
4. Delete the group — verify it's gone after refresh

- [ ] **Step 7: Commit**

```bash
git add components/dashboard.tsx
git commit -m "feat: migrate groups from localStorage to PostgreSQL via /api/groups"
```

---

## Task 18: Wire existing usage-events and audit-logs API routes to sync layer

**Files:**
- Modify or create: `app/api/usage-events/route.ts`
- Modify or create: `app/api/audit-logs/route.ts`

- [ ] **Step 1: Check if these routes already exist**

```bash
ls app/api/
```

- [ ] **Step 2: Update or create `app/api/usage-events/route.ts`**

If the file exists, replace the `getUsageEvents` import with the sync version. If it doesn't exist, create it:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveWindowSelection } from "@/lib/metrics";
import { syncAndQueryUsageEvents } from "@/lib/sync/usage-events";

const QuerySchema = z.object({
  window: z.string().optional(),
  email: z.string().email().optional()
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const query = QuerySchema.parse({
      window: request.nextUrl.searchParams.get("window") || undefined,
      email: request.nextUrl.searchParams.get("email") || undefined
    });

    const selectedWindow = resolveWindowSelection(query.window);
    const events = await syncAndQueryUsageEvents(
      selectedWindow.startDate,
      selectedWindow.endDate,
      query.email ? { email: query.email } : undefined
    );

    return NextResponse.json({ events, window: { id: selectedWindow.id, label: selectedWindow.label } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Update or create `app/api/audit-logs/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveWindowSelection } from "@/lib/metrics";
import { syncAndQueryAuditLogs } from "@/lib/sync/audit-logs";

const QuerySchema = z.object({
  window: z.string().optional(),
  email: z.string().email().optional(),
  eventType: z.string().optional()
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const query = QuerySchema.parse({
      window: request.nextUrl.searchParams.get("window") || undefined,
      email: request.nextUrl.searchParams.get("email") || undefined,
      eventType: request.nextUrl.searchParams.get("eventType") || undefined
    });

    const selectedWindow = resolveWindowSelection(query.window);
    const logs = await syncAndQueryAuditLogs(selectedWindow.startDate, selectedWindow.endDate, {
      ...(query.email && { users: [query.email] }),
      ...(query.eventType && { eventTypes: [query.eventType] })
    });

    return NextResponse.json({ logs, window: { id: selectedWindow.id, label: selectedWindow.label } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/usage-events/ app/api/audit-logs/
git commit -m "feat: usage-events and audit-logs routes use sync layer"
```

---

## Task 19: Add subscriptionIncludedReqs footgun warning

**Files:**
- Modify: `lib/cursor-admin.ts`

This is a forward-looking safety measure. The docs explicitly warn: `subscriptionIncludedReqs`, `usageBasedReqs`, and `apiKeyReqs` count **raw usage events, not billable request units**. Anyone adding cost/billing metrics later must use `/teams/filtered-usage-events` and sum `chargedCents` instead.

- [ ] **Step 1: Add warning comment to DailyUsageRow interface**

In `lib/cursor-admin.ts`, update the three fields in the `DailyUsageRow` interface:

```ts
/**
 * WARNING: These three fields count raw usage events, NOT billable request units.
 * Do NOT use them for cost or billing calculations.
 * For accurate spend data, use the /teams/filtered-usage-events endpoint and sum chargedCents.
 * See: https://cursor.com/docs/api#get-usage-events-data
 */
subscriptionIncludedReqs?: number;
usageBasedReqs?: number;
apiKeyReqs?: number;
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/cursor-admin.ts
git commit -m "docs: warn subscriptionIncludedReqs is not billable units"
```

---

## Task 20: Add cost data — /teams/spend endpoint

**Files:**
- Modify: `lib/cursor-admin.ts` — add `SpendEntry` interface + `getTeamSpend()` function
- Create: `lib/db/queries/spend.ts` — upsert + query for spend data
- Modify: `lib/db/schema.ts` — add `teamSpend` table
- Create: `lib/sync/spend.ts` — syncAndQuerySpend()
- Create: `app/api/spend/route.ts` — expose spend data to dashboard

- [ ] **Step 1: Add teamSpend table to schema**

In `lib/db/schema.ts`, add after the `syncLog` table definition:

```ts
export const teamSpend = pgTable("team_spend", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  email: text("email").notNull(),
  name: text("name"),
  role: text("role"),
  spendCents: integer("spend_cents").notNull().default(0),
  overallSpendCents: integer("overall_spend_cents").notNull().default(0),
  fastPremiumRequests: integer("fast_premium_requests").notNull().default(0),
  hardLimitOverrideDollars: integer("hard_limit_override_dollars").notNull().default(0),
  monthlyLimitDollars: integer("monthly_limit_dollars"),
  billingCycleStart: timestamp("billing_cycle_start", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull()
});
```

Also add `"team_spend"` as a valid data type in `sync_log` — it's tracked via the sync_log with `date = billing cycle start date`, no schema change needed.

- [ ] **Step 2: Generate and run migration for teamSpend table**

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

Expected: new migration file created and applied, `team_spend` table appears in DB:
```bash
psql -U amitturare -h localhost -p 5432 cursor_teams_dashboard -c "\dt"
```

- [ ] **Step 3: Add SpendEntry interface and getTeamSpend() to cursor-admin.ts**

In `lib/cursor-admin.ts`, add after the `RepoBlocklistEntry` interface:

```ts
export interface SpendEntry {
  userId: number;
  name: string;
  email: string;
  role: string;
  spendCents: number;
  overallSpendCents: number;
  fastPremiumRequests: number;
  hardLimitOverrideDollars: number;
  monthlyLimitDollars: number | null;
}
```

Add the Zod schema after `RepoBlocklistsResponseSchema`:

```ts
const TeamSpendResponseSchema = z.object({
  teamMemberSpend: z.array(
    z.object({
      userId: z.number(),
      name: z.string(),
      email: z.string(),
      role: z.string(),
      spendCents: z.number(),
      overallSpendCents: z.number(),
      fastPremiumRequests: z.number(),
      hardLimitOverrideDollars: z.number(),
      monthlyLimitDollars: z.number().nullable()
    })
  ),
  subscriptionCycleStart: z.number().optional(),
  totalMembers: z.number().optional(),
  totalPages: z.number().optional()
});
```

Add the function after `getRepoBlocklists()`:

```ts
export async function getTeamSpend(options?: { page?: number; pageSize?: number }): Promise<{
  entries: SpendEntry[];
  cycleStart?: number;
}> {
  const pageSize = options?.pageSize ?? 200;
  let page = options?.page ?? 1;
  const allEntries: SpendEntry[] = [];
  const seen = new Set<number>();

  while (true) {
    const { data } = await cursorRequest(
      "/teams/spend",
      { method: "POST", json: { page, pageSize } },
      TeamSpendResponseSchema
    );

    for (const entry of data.teamMemberSpend) {
      if (seen.has(entry.userId)) continue;
      seen.add(entry.userId);
      allEntries.push(entry);
    }

    const totalPages = data.totalPages ?? 1;
    if (page >= totalPages) break;
    page += 1;

    if (page > 1000) {
      throw new Error("Aborting spend pagination at 1000 pages. Contact support.");
    }
  }

  return { entries: allEntries, cycleStart: data?.subscriptionCycleStart };
}
```

Wait — `data` is out of scope in the return. Fix the return:

```ts
export async function getTeamSpend(options?: { page?: number; pageSize?: number }): Promise<{
  entries: SpendEntry[];
  cycleStart?: number;
}> {
  const pageSize = options?.pageSize ?? 200;
  let page = 1;
  const allEntries: SpendEntry[] = [];
  const seen = new Set<number>();
  let cycleStart: number | undefined;

  while (true) {
    const { data } = await cursorRequest(
      "/teams/spend",
      { method: "POST", json: { page, pageSize } },
      TeamSpendResponseSchema
    );

    if (cycleStart === undefined) {
      cycleStart = data.subscriptionCycleStart;
    }

    for (const entry of data.teamMemberSpend) {
      if (seen.has(entry.userId)) continue;
      seen.add(entry.userId);
      allEntries.push(entry);
    }

    const totalPages = data.totalPages ?? 1;
    if (page >= totalPages) break;
    page += 1;

    if (page > 1000) {
      throw new Error("Aborting spend pagination at 1000 pages.");
    }
  }

  return { entries: allEntries, cycleStart };
}
```

- [ ] **Step 4: Create `lib/db/queries/spend.ts`**

```ts
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { teamSpend } from "@/lib/db/schema";
import type { SpendEntry } from "@/lib/cursor-admin";

export async function upsertTeamSpend(entries: SpendEntry[], cycleStart?: number): Promise<void> {
  if (entries.length === 0) return;
  const now = new Date();
  const cycleStartDate = cycleStart ? new Date(cycleStart) : null;

  await db
    .insert(teamSpend)
    .values(
      entries.map((e) => ({
        userId: e.userId,
        email: e.email,
        name: e.name,
        role: e.role,
        spendCents: e.spendCents,
        overallSpendCents: e.overallSpendCents,
        fastPremiumRequests: e.fastPremiumRequests,
        hardLimitOverrideDollars: e.hardLimitOverrideDollars,
        monthlyLimitDollars: e.monthlyLimitDollars ?? null,
        billingCycleStart: cycleStartDate,
        syncedAt: now
      }))
    )
    .onConflictDoUpdate({
      target: teamSpend.userId,
      set: {
        email: sql`excluded.email`,
        name: sql`excluded.name`,
        role: sql`excluded.role`,
        spendCents: sql`excluded.spend_cents`,
        overallSpendCents: sql`excluded.overall_spend_cents`,
        fastPremiumRequests: sql`excluded.fast_premium_requests`,
        hardLimitOverrideDollars: sql`excluded.hard_limit_override_dollars`,
        monthlyLimitDollars: sql`excluded.monthly_limit_dollars`,
        billingCycleStart: sql`excluded.billing_cycle_start`,
        syncedAt: sql`excluded.synced_at`
      }
    });
}

export async function queryTeamSpend(): Promise<SpendEntry[]> {
  const rows = await db.select().from(teamSpend);
  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    name: r.name ?? "",
    role: r.role ?? "member",
    spendCents: r.spendCents,
    overallSpendCents: r.overallSpendCents,
    fastPremiumRequests: r.fastPremiumRequests,
    hardLimitOverrideDollars: r.hardLimitOverrideDollars,
    monthlyLimitDollars: r.monthlyLimitDollars ?? null
  }));
}
```

Note: `teamSpend` needs a UNIQUE constraint on `userId`. Update the schema definition in Step 1 to add `.unique()`:
```ts
userId: integer("user_id").notNull().unique(),
```
Then re-run `npx drizzle-kit generate && npx drizzle-kit migrate`.

- [ ] **Step 5: Create `lib/sync/spend.ts`**

Spend data is per billing cycle, not per day. Use `sync_log` with `data_type = 'team_spend'` and `date = today` with a 1-hour staleness threshold (billing data updates throughout the day).

```ts
import { getTeamSpend } from "@/lib/cursor-admin";
import { upsertTeamSpend, queryTeamSpend } from "@/lib/db/queries/spend";
import { getStaleDates, markSynced } from "@/lib/db/queries/sync-log";
import type { SpendEntry } from "@/lib/cursor-admin";

export async function syncAndQuerySpend(): Promise<SpendEntry[]> {
  const today = new Date();
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  const staleDates = await getStaleDates("team_spend", todayMs, todayMs + 24 * 60 * 60 * 1000);

  if (staleDates.length > 0) {
    const { entries, cycleStart } = await getTeamSpend();
    await upsertTeamSpend(entries, cycleStart);
    await markSynced("team_spend", staleDates);
  }

  return queryTeamSpend();
}
```

- [ ] **Step 6: Create `app/api/spend/route.ts`**

```ts
import { NextResponse } from "next/server";
import { syncAndQuerySpend } from "@/lib/sync/spend";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const entries = await syncAndQuerySpend();
    return NextResponse.json({ entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { error: message, hint: "Verify CURSOR_ADMIN_API_KEY has team admin permissions" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Verify spend endpoint works**

With `npm run dev` running:
```bash
curl http://localhost:3000/api/spend | jq '.entries[0]'
```

Expected: JSON object with `userId`, `email`, `spendCents`, `overallSpendCents`, etc.

- [ ] **Step 9: Commit**

```bash
git add lib/cursor-admin.ts lib/db/schema.ts lib/db/queries/spend.ts lib/sync/spend.ts app/api/spend/ drizzle/
git commit -m "feat: add cost data — /teams/spend endpoint with DB sync"
```

---

## Task 22: Final verification

- [ ] **Step 1: Full typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 2: Production build**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 3: Verify DB has data after a dashboard load**

```bash
psql -U amitturare -h localhost -p 5432 cursor_teams_dashboard -c "SELECT COUNT(*) FROM daily_usage_rows;"
psql -U amitturare -h localhost -p 5432 cursor_teams_dashboard -c "SELECT COUNT(*) FROM team_members;"
psql -U amitturare -h localhost -p 5432 cursor_teams_dashboard -c "SELECT data_type, COUNT(*), MAX(synced_at) FROM sync_log GROUP BY data_type;"
```

Expected: non-zero counts and recent `synced_at` timestamps.

- [ ] **Step 4: Verify stale check works**

Load the dashboard twice within 1 minute. Second response should include `"cached": true` in the JSON (check Network tab in browser devtools).

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete DB + sync layer + best practices implementation"
```

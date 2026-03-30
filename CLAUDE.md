# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start development server at http://localhost:3000
npm run build      # Production build
npm run start      # Run production server
npm run typecheck  # Type-check without emitting (tsc --noEmit)
```

No test runner or linter is configured.

## Environment Setup

Copy `.env.example` to `.env` and set:
- `CURSOR_ADMIN_API_KEY` — required; Basic Auth credentials for the Cursor Admin API
- `CURSOR_API_BASE_URL` — optional; defaults to `https://api.cursor.com`

## Architecture

This is a Next.js app that displays Cursor team usage metrics pulled from the Cursor Team Admin API.

### Data Flow

1. `components/dashboard.tsx` (client component) fetches `GET /api/team-metrics?window=<id>`
2. `app/api/team-metrics/route.ts` validates the query, checks a 5-minute in-memory cache, then calls the Cursor Admin API via `lib/cursor-admin.ts`
3. `lib/cursor-admin.ts` calls two endpoints — `/teams/members` and `/teams/daily-usage-data` — with automatic 30-day chunking, pagination, exponential backoff on 429s, and row deduplication
4. `lib/metrics.ts` aggregates the raw daily rows into per-user metric objects (usage counts, productivity, efficiency ratios, adoption, favorite model) and manages available time windows
5. The API returns `{ rows, definitions, availableWindows, selectedWindow }` to the dashboard

### Key Design Decisions

- **No database.** User groups are persisted in `localStorage` under the key `cursor-dashboard-user-groups`. Server-side metric cache is in-memory (lost on restart).
- **Single large client component.** `components/dashboard.tsx` owns all UI state: time window selection, group/user filtering, tab navigation, and group management. Filtering and grouping happen client-side after the fetch.
- **Time windows.** `lib/metrics.ts` exposes `getAvailableWindows()` which returns presets (`past-7d`, `past-30d`, `current-month`) plus the 12 prior calendar months. The API accepts any of these IDs.
- **Cursor API chunking.** The Cursor API enforces a 30-day max per request. `lib/cursor-admin.ts` splits longer windows into sequential 30-day chunks and merges results.
- **Removed users.** Members with `role === "removed"` are automatically placed into a special "Removed" group in the dashboard UI.

import { z } from "zod";

const DEFAULT_BASE_URL = "https://api.cursor.com";
const MAX_DAILY_RANGE_DAYS = 30;
const MAX_USAGE_EVENTS_RANGE_DAYS = 30;
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1200;

export interface TeamMember {
  id: number | string;
  email: string;
  name?: string;
  role?: string;
  isRemoved?: boolean;
}

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
  /**
   * Raw usage event count for the subscription plan.
   * ⚠️ WARNING: counts raw usage events, NOT billable request units.
   * Do NOT use for cost calculations. For billing-accurate data, use
   * `/teams/filtered-usage-events` and sum `chargedCents`.
   */
  subscriptionIncludedReqs?: number;
  usageBasedReqs?: number;
  apiKeyReqs?: number;
  bugbotUsages?: number;
  applyMostUsedExtension?: string | null;
  tabMostUsedExtension?: string | null;
  clientVersion?: string | null;
  mostUsedModel?: string | null;
}

export interface UsageEvent {
  timestamp: string | number;
  model?: string;
  kind?: string;
  maxMode?: boolean;
  requestsCosts?: number;
  chargedCents?: number;
  isTokenBasedCall?: boolean;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheWriteTokens?: number;
    cacheReadTokens?: number;
    totalCents?: number;
  };
  isFreeBugbot?: boolean;
  userEmail?: string;
}

const TeamMembersResponseSchema = z.object({
  teamMembers: z.array(
    z.object({
      id: z.union([z.number(), z.string()]),
      name: z.string().optional(),
      email: z.string().email(),
      role: z.string().optional(),
      isRemoved: z.boolean().optional()
    })
  )
});

const DailyUsageResponseSchema = z.object({
  data: z.array(
    z.object({
      date: z.number(),
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
      userId: z.preprocess((v) => { const n = Number(v); return (v == null || Number.isNaN(n)) ? undefined : n; }, z.number().optional()),
      subscriptionIncludedReqs: z.number().optional(),
      usageBasedReqs: z.number().optional(),
      apiKeyReqs: z.number().optional(),
      bugbotUsages: z.number().optional(),
      applyMostUsedExtension: z.string().optional().nullable(),
      tabMostUsedExtension: z.string().optional().nullable(),
      clientVersion: z.string().optional().nullable(),
      mostUsedModel: z.string().optional().nullable(),
      email: z.string().email().optional()
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

const UsageEventsResponseSchema = z.object({
  totalUsageEventsCount: z.number().optional(),
  pagination: z
    .object({
      numPages: z.number().optional(),
      currentPage: z.number().optional(),
      pageSize: z.number().optional(),
      hasNextPage: z.boolean().optional()
    })
    .optional(),
  usageEvents: z.array(
    z.object({
      timestamp: z.union([z.string(), z.number()]).optional(),
      model: z.string().optional().nullable(),
      kind: z.string().optional().nullable(),
      maxMode: z.boolean().optional().nullable(),
      requestsCosts: z.number().optional().nullable(),
      chargedCents: z.number().optional().nullable(),
      isTokenBasedCall: z.boolean().optional().nullable(),
      tokenUsage: z
        .object({
          inputTokens: z.number().optional(),
          outputTokens: z.number().optional(),
          cacheWriteTokens: z.number().optional(),
          cacheReadTokens: z.number().optional(),
          totalCents: z.number().optional()
        })
        .optional(),
      isFreeBugbot: z.boolean().optional().nullable(),
      userEmail: z.string().optional().nullable()
    }).passthrough()
  )
});

function getBaseUrl() {
  return process.env.CURSOR_API_BASE_URL || DEFAULT_BASE_URL;
}

function getApiKey() {
  const key = process.env.CURSOR_ADMIN_API_KEY;
  if (!key) {
    throw new Error("CURSOR_ADMIN_API_KEY is not set");
  }
  return key;
}

function buildAuthHeader() {
  const apiKey = getApiKey();
  const encoded = Buffer.from(`${apiKey}:`).toString("base64");
  return `Basic ${encoded}`;
}

type JsonRequestOptions = Omit<RequestInit, "headers" | "body"> & {
  json?: unknown;
  searchParams?: Record<string, string | number | undefined>;
  etag?: string; // If-None-Match value from previous response
};

type CursorResponse<T> = { data: T; etag?: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(response: Response, attempt: number) {
  const retryAfterSeconds = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  return BASE_RETRY_DELAY_MS * 2 ** attempt;
}

/** Surface Cursor JSON `{ message }` (or plain text) instead of raw dump + path. */
function formatCursorErrorMessage(status: number, body: string): string {
  const trimmed = body.trim();
  try {
    const parsed = JSON.parse(trimmed) as { message?: string; error?: string };
    const detail = typeof parsed.message === "string" ? parsed.message : parsed.error;
    if (typeof detail === "string" && detail.length > 0) return detail;
  } catch {
    // not JSON
  }
  if (trimmed.length > 0 && trimmed.length <= 280) return trimmed;
  return `Cursor API returned ${status}. Try again or adjust the request.`;
}

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

function splitIntoDateRanges(startDate: number, endDate: number, maxDays: number) {
  const ranges: Array<{ startDate: number; endDate: number }> = [];
  const maxMs = maxDays * 24 * 60 * 60 * 1000;

  let cursor = startDate;
  while (cursor < endDate) {
    const next = Math.min(cursor + maxMs, endDate);
    ranges.push({ startDate: cursor, endDate: next });
    cursor = next;
  }

  return ranges;
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const { data } = await cursorRequest("/teams/members", { method: "GET" }, TeamMembersResponseSchema);
  return data.teamMembers;
}

export async function getDailyUsageData(startDate: number, endDate: number): Promise<DailyUsageRow[]> {
  const chunks = splitIntoDateRanges(startDate, endDate, MAX_DAILY_RANGE_DAYS);
  const allRows: DailyUsageRow[] = [];
  const seen = new Set<string>();
  const pageSize = 200;

  for (const chunk of chunks) {
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      const { data: responseData } = await cursorRequest(
        "/teams/daily-usage-data",
        {
          method: "POST",
          json: {
            startDate: chunk.startDate,
            endDate: chunk.endDate,
            page,
            pageSize
          }
        },
        DailyUsageResponseSchema
      );

      for (const row of responseData.data) {
        if (!row.email) continue;
        const key = `${row.email}::${row.date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allRows.push(row);
      }

      hasNextPage = Boolean(responseData.pagination?.hasNextPage);
      page += 1;

      if (page > 1000) {
        throw new Error("Aborting daily usage pagination at 1000 pages per chunk. Narrow date range.");
      }
    }
  }

  return allRows;
}

export interface AuditLogEntry {
  timestamp?: string;
  userEmail?: string;
  eventType?: string;
  eventData?: Record<string, unknown>;
}

export interface RepoBlocklistEntry {
  id: string;
  url: string;
  patterns: string[];
}

const AuditLogEntrySchema = z
  .object({
    timestamp: z.string().optional(),
    user_email: z.string().optional(),
    event_type: z.string().optional(),
    event_data: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

const AuditLogsResponseSchema = z.object({
  events: z.array(AuditLogEntrySchema).optional(),
  auditLogs: z.array(AuditLogEntrySchema).optional(),
  pagination: z
    .object({
      hasNextPage: z.boolean().optional(),
      currentPage: z.number().optional(),
      numPages: z.number().optional()
    })
    .optional()
});

const RepoBlocklistsResponseSchema = z.object({
  repos: z.array(
    z
      .object({
        id: z.string(),
        url: z.string(),
        patterns: z.array(z.string())
      })
      .passthrough()
  )
});

const UpsertRepoBlocklistResponseSchema = z.object({}).passthrough();
const DeleteResponseSchema = z.object({}).passthrough();

export async function getUsageEvents(
  startDate: number,
  endDate: number,
  options?: { email?: string }
): Promise<UsageEvent[]> {
  const ranges = splitIntoDateRanges(startDate, endDate, MAX_USAGE_EVENTS_RANGE_DAYS);
  const pageSize = 200;
  const allEvents: UsageEvent[] = [];
  const seen = new Set<string>();

  for (const range of ranges) {
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      const { data: eventsData } = await cursorRequest(
        "/teams/filtered-usage-events",
        {
          method: "POST",
          json: {
            startDate: range.startDate,
            endDate: range.endDate,
            email: options?.email,
            page,
            pageSize
          }
        },
        UsageEventsResponseSchema
      );

      for (const event of eventsData.usageEvents) {
        if (event.timestamp === undefined) {
          continue;
        }
        if (!event.userEmail) {
          continue;
        }
        const key = `${event.userEmail}::${event.timestamp}::${event.model || "unknown"}::${event.kind || "unknown"}::${event.requestsCosts || 0}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        allEvents.push({
          ...event,
          timestamp: event.timestamp,
          userEmail: event.userEmail,
          model: event.model ?? undefined,
          kind: event.kind ?? undefined,
          maxMode: event.maxMode ?? undefined,
          requestsCosts: event.requestsCosts ?? undefined,
          chargedCents: event.chargedCents ?? undefined,
          isTokenBasedCall: event.isTokenBasedCall ?? undefined,
          isFreeBugbot: event.isFreeBugbot ?? undefined
        });
      }

      hasNextPage = Boolean(eventsData.pagination?.hasNextPage);
      page += 1;

      if (page > 1000) {
        throw new Error("Aborting usage event pagination at 1000 pages per chunk. Narrow date range.");
      }
    }
  }

  return allEvents;
}

export async function getAuditLogs(
  startDate: number,
  endDate: number,
  options?: { search?: string; eventTypes?: string[]; users?: string[] }
): Promise<AuditLogEntry[]> {
  const ranges = splitIntoDateRanges(startDate, endDate, MAX_DAILY_RANGE_DAYS);
  const pageSize = 200;
  const allLogs: AuditLogEntry[] = [];
  const seen = new Set<string>();

  for (const range of ranges) {
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      const { data: auditData } = await cursorRequest(
        "/teams/audit-logs",
        {
          method: "GET",
          searchParams: {
            startTime: range.startDate,
            endTime: range.endDate,
            page,
            pageSize,
            ...(options?.search ? { search: options.search } : {}),
            ...(options?.eventTypes?.length ? { eventTypes: options.eventTypes.join(",") } : {}),
            ...(options?.users?.length ? { users: options.users.join(",") } : {})
          }
        },
        AuditLogsResponseSchema
      );

      // API may return field as `events` or `auditLogs`
      let entries = auditData.events;
      if (!entries) {
        if (auditData.auditLogs) {
          console.warn("[cursor-api] audit logs returned under `auditLogs` key (expected `events`)");
          entries = auditData.auditLogs;
        } else {
          entries = [];
        }
      }

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

      hasNextPage = Boolean(auditData.pagination?.hasNextPage);
      page += 1;

      if (page > 1000) {
        throw new Error("Aborting audit log pagination at 1000 pages per chunk. Narrow date range.");
      }
    }
  }

  return allLogs;
}

export async function getRepoBlocklists(): Promise<RepoBlocklistEntry[]> {
  const { data } = await cursorRequest(
    "/settings/repo-blocklists/repos",
    { method: "GET" },
    RepoBlocklistsResponseSchema
  );
  return data.repos as RepoBlocklistEntry[];
}

export async function upsertRepoBlocklist(url: string, patterns: string[]): Promise<void> {
  await cursorRequest(
    "/settings/repo-blocklists/repos/upsert",
    {
      method: "POST",
      json: { repos: [{ url, patterns }] }
    },
    UpsertRepoBlocklistResponseSchema
  );
}

export async function deleteRepoBlocklist(repoId: string): Promise<void> {
  await cursorRequest(
    `/settings/repo-blocklists/repos/${encodeURIComponent(repoId)}`,
    { method: "DELETE" },
    DeleteResponseSchema
  );
}

export interface TeamSpendEntry {
  userId?: number;
  name?: string;
  email: string;
  role?: string;
  spendCents?: number;
  overallSpendCents?: number;
  fastPremiumRequests?: number;
  hardLimitOverrideDollars?: number;
  monthlyLimitDollars?: number | null;
}

export interface TeamSpendResponse {
  entries: TeamSpendEntry[];
  billingCycleStart: number;
}

const TeamSpendResponseSchema = z.object({
  teamMemberSpend: z.array(
    z.object({
      userId: z.preprocess((v) => { const n = Number(v); return (v == null || Number.isNaN(n)) ? undefined : n; }, z.number().optional()),
      name: z.string().optional(),
      email: z.string(),
      role: z.string().optional(),
      spendCents: z.number().optional(),
      overallSpendCents: z.number().optional(),
      fastPremiumRequests: z.number().optional(),
      hardLimitOverrideDollars: z.number().optional(),
      monthlyLimitDollars: z.number().nullable().optional()
    }).passthrough()
  ),
  subscriptionCycleStart: z.number().optional(),
  totalMembers: z.number().optional(),
  totalPages: z.number().optional()
});

export async function getTeamSpend(): Promise<TeamSpendResponse> {
  const allEntries: TeamSpendEntry[] = [];
  let page = 1;
  let totalPages = 1;
  let billingCycleStart = 0;

  while (page <= totalPages) {
    const { data } = await cursorRequest(
      "/teams/spend",
      { method: "POST", json: { page, pageSize: 200 } },
      TeamSpendResponseSchema
    );
    if (page === 1) {
      billingCycleStart = data.subscriptionCycleStart ?? 0;
      totalPages = data.totalPages ?? 1;
    }
    for (const entry of data.teamMemberSpend) {
      allEntries.push({
        userId: entry.userId,
        name: entry.name,
        email: entry.email,
        role: entry.role,
        spendCents: entry.spendCents,
        overallSpendCents: entry.overallSpendCents,
        fastPremiumRequests: entry.fastPremiumRequests,
        hardLimitOverrideDollars: entry.hardLimitOverrideDollars,
        monthlyLimitDollars: entry.monthlyLimitDollars
      });
    }
    page += 1;
  }

  return { entries: allEntries, billingCycleStart };
}

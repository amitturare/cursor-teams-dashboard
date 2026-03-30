import { z } from "zod";

const DEFAULT_BASE_URL = "https://api.cursor.com";
const MAX_DAILY_RANGE_DAYS = 30;
const MAX_USAGE_EVENTS_RANGE_DAYS = 30;
const MAX_RETRIES = 4;
const BASE_RETRY_DELAY_MS = 1200;

export interface TeamMember {
  email: string;
  name?: string;
  role?: string;
}

export interface DailyUsageRow {
  date: number;
  email?: string;
  userEmail?: string;
  memberEmail?: string;
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
  mostUsedModel?: string;
}

export interface UsageEvent {
  timestamp: string | number;
  model?: string;
  kind?: string;
  maxMode?: boolean;
  requestsCosts?: number;
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
  email?: string;
}

const TeamMembersResponseSchema = z.object({
  teamMembers: z.array(
    z.object({
      name: z.string().optional(),
      email: z.string().email(),
      role: z.string().optional()
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
      mostUsedModel: z.string().optional(),
      email: z.string().email().optional(),
      userEmail: z.string().email().optional(),
      memberEmail: z.string().email().optional()
    })
  )
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
      userEmail: z.string().optional().nullable(),
      email: z.string().optional().nullable()
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
};

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

async function cursorRequest<T>(path: string, options: JsonRequestOptions, schema: z.ZodType<T>): Promise<T> {
  const url = `${getBaseUrl()}${path}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: buildAuthHeader(),
        "Content-Type": "application/json"
      },
      body: options.json === undefined ? undefined : JSON.stringify(options.json),
      cache: "no-store"
    });

    if (response.ok) {
      const json = await response.json();
      return schema.parse(json);
    }

    if (response.status === 429 && attempt < MAX_RETRIES) {
      await sleep(getRetryDelayMs(response, attempt));
      continue;
    }

    const message = await response.text();
    throw new Error(`Cursor API ${path} failed (${response.status}): ${message}`);
  }

  throw new Error(`Cursor API ${path} failed after retries`);
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
  const response = await cursorRequest("/teams/members", { method: "GET" }, TeamMembersResponseSchema);
  return response.teamMembers;
}

export async function getDailyUsageData(startDate: number, endDate: number): Promise<DailyUsageRow[]> {
  const chunks = splitIntoDateRanges(startDate, endDate, MAX_DAILY_RANGE_DAYS);
  const allRows: DailyUsageRow[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    const response = await cursorRequest(
      "/teams/daily-usage-data",
      {
        method: "POST",
        json: {
          startDate: chunk.startDate,
          endDate: chunk.endDate
        }
      },
      DailyUsageResponseSchema
    );

    for (const row of response.data) {
      const email = row.email || row.userEmail || row.memberEmail || "unknown";
      const key = `${email}::${row.date}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      allRows.push(row);
    }
  }

  return allRows;
}

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
      const response = await cursorRequest(
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

      for (const event of response.usageEvents) {
        if (event.timestamp === undefined) {
          continue;
        }
        const eventEmail = event.userEmail || event.email;
        if (!eventEmail) {
          continue;
        }
        const key = `${eventEmail}::${event.timestamp}::${event.model || "unknown"}::${event.kind || "unknown"}::${event.requestsCosts || 0}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        allEvents.push({
          ...event,
          timestamp: event.timestamp,
          userEmail: eventEmail,
          email: event.email ?? undefined,
          model: event.model ?? undefined,
          kind: event.kind ?? undefined,
          maxMode: event.maxMode ?? undefined,
          requestsCosts: event.requestsCosts ?? undefined,
          isTokenBasedCall: event.isTokenBasedCall ?? undefined,
          isFreeBugbot: event.isFreeBugbot ?? undefined
        });
      }

      hasNextPage = Boolean(response.pagination?.hasNextPage);
      page += 1;

      if (page > 1000) {
        throw new Error("Aborting usage event pagination at 1000 pages per chunk. Narrow date range.");
      }
    }
  }

  return allEvents;
}

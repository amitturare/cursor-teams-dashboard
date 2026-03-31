import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAuditLogs } from "@/lib/cursor-admin";
import type { AuditLogEntry } from "@/lib/cursor-admin";
import { resolveWindowSelection } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 3 * 60 * 1000;

type CachedAuditLogs = {
  logs: AuditLogEntry[];
  expiresAt: number;
};

const auditCache = new Map<string, CachedAuditLogs>();

const QuerySchema = z.object({
  window: z.string().optional(),
  search: z.string().optional(),
  eventTypes: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100)
});

export async function GET(request: NextRequest) {
  try {
    const query = QuerySchema.parse({
      window: request.nextUrl.searchParams.get("window") || undefined,
      search: request.nextUrl.searchParams.get("search") || undefined,
      eventTypes: request.nextUrl.searchParams.get("eventTypes") || undefined,
      page: request.nextUrl.searchParams.get("page") || undefined,
      pageSize: request.nextUrl.searchParams.get("pageSize") || undefined
    });

    const selectedWindow = resolveWindowSelection(query.window);
    const cacheKey = `${selectedWindow.id}::${query.search ?? ""}::${query.eventTypes ?? ""}`;
    const cached = auditCache.get(cacheKey);

    let allLogs: AuditLogEntry[];
    if (cached && cached.expiresAt > Date.now()) {
      allLogs = cached.logs;
    } else {
      allLogs = await getAuditLogs(selectedWindow.startDate, selectedWindow.endDate, {
        search: query.search,
        eventTypes: query.eventTypes ? query.eventTypes.split(",").map((s) => s.trim()) : undefined
      });
      auditCache.set(cacheKey, { logs: allLogs, expiresAt: Date.now() + CACHE_TTL_MS });
    }

    const total = allLogs.length;
    const start = (query.page - 1) * query.pageSize;
    const logs = allLogs.slice(start, start + query.pageSize);
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

    return NextResponse.json({
      logs,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages,
      selectedWindow: {
        id: selectedWindow.id,
        label: selectedWindow.label,
        startDate: selectedWindow.startDate,
        endDate: selectedWindow.endDate
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { error: message, hint: "Verify CURSOR_ADMIN_API_KEY is set and your API key has team admin permissions" },
      { status: 500 }
    );
  }
}

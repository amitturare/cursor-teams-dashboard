import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { syncAndQueryAuditLogs } from "@/lib/sync/audit-logs";
import type { AuditLogEntry } from "@/lib/cursor-admin";
import { resolveWindowSelection } from "@/lib/metrics";

export const dynamic = "force-dynamic";

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
    const startDateStr = new Date(selectedWindow.startDate).toISOString().slice(0, 10);
    const endDateStr = new Date(selectedWindow.endDate).toISOString().slice(0, 10);

    const allLogs: AuditLogEntry[] = await syncAndQueryAuditLogs(startDateStr, endDateStr);

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

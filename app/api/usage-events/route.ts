import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { syncAndQueryUsageEvents } from "@/lib/sync/usage-events";
import type { UsageEvent } from "@/lib/cursor-admin";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  email: z.string().email().optional(),
  startDate: z.coerce.number().int().positive(),
  endDate: z.coerce.number().int().positive(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(50)
});

export async function GET(request: NextRequest) {
  try {
    const query = QuerySchema.parse({
      email: request.nextUrl.searchParams.get("email") || undefined,
      startDate: request.nextUrl.searchParams.get("startDate") || undefined,
      endDate: request.nextUrl.searchParams.get("endDate") || undefined,
      page: request.nextUrl.searchParams.get("page") || undefined,
      pageSize: request.nextUrl.searchParams.get("pageSize") || undefined
    });

    const startDateStr = new Date(query.startDate).toISOString().slice(0, 10);
    const endDateStr = new Date(query.endDate).toISOString().slice(0, 10);
    const allEvents: UsageEvent[] = await syncAndQueryUsageEvents(startDateStr, endDateStr, query.email);

    const total = allEvents.length;
    const start = (query.page - 1) * query.pageSize;
    const events = allEvents.slice(start, start + query.pageSize);
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

    return NextResponse.json({ events, total, page: query.page, pageSize: query.pageSize, totalPages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { error: message, hint: "Verify CURSOR_ADMIN_API_KEY is set and your API key has team admin permissions" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveWindowSelection } from "@/lib/metrics";
import { queryDailyUsageRows } from "@/lib/db/queries/daily-usage";

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
    const oneDayMs = 24 * 60 * 60 * 1000;
    const startDateStr = new Date(selectedWindow.startDate).toISOString().slice(0, 10);
    const inclusiveEndMs = selectedWindow.endDate - oneDayMs;
    const endDateStr = new Date(inclusiveEndMs).toISOString().slice(0, 10);
    const allRows = await queryDailyUsageRows(startDateStr, endDateStr);

    const rows = query.email
      ? allRows.filter((r) => r.email === query.email)
      : allRows;

    return NextResponse.json({
      rows,
      window: { id: selectedWindow.id, label: selectedWindow.label }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

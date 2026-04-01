import { NextResponse } from "next/server";
import { syncAndQuerySpend } from "@/lib/sync/spend";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const spend = await syncAndQuerySpend();
    return NextResponse.json(spend);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { error: message, hint: "Verify CURSOR_ADMIN_API_KEY is set and your API key has team admin permissions" },
      { status: 500 }
    );
  }
}

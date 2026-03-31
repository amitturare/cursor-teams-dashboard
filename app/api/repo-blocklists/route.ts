import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRepoBlocklists, upsertRepoBlocklist } from "@/lib/cursor-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const repos = await getRepoBlocklists();
    return NextResponse.json({ repos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { error: message, hint: "Verify CURSOR_ADMIN_API_KEY is set and your API key has team admin permissions" },
      { status: 500 }
    );
  }
}

const UpsertBodySchema = z.object({
  url: z.string().min(1),
  patterns: z.array(z.string())
});

export async function POST(request: NextRequest) {
  try {
    const body = UpsertBodySchema.parse(await request.json());
    await upsertRepoBlocklist(body.url, body.patterns);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request body", details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { error: message, hint: "Verify CURSOR_ADMIN_API_KEY is set and your API key has team admin permissions" },
      { status: 500 }
    );
  }
}

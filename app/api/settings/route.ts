import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSetting, upsertSetting } from "@/lib/db/queries/settings";

const ALLOWED_KEYS = ["quota_cap"] as const;
type SettingKey = (typeof ALLOWED_KEYS)[number];

const UpsertSchema = z.object({
  key: z.enum(ALLOWED_KEYS),
  value: z.string().min(1)
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get("key");
    if (!key || !ALLOWED_KEYS.includes(key as SettingKey)) {
      return NextResponse.json({ error: `key must be one of: ${ALLOWED_KEYS.join(", ")}` }, { status: 400 });
    }
    const value = await getSetting(key);
    return NextResponse.json({ key, value: value ?? "500", updatedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = UpsertSchema.parse(await request.json());
    await upsertSetting(body.key, body.value);
    return NextResponse.json({ key: body.key, value: body.value });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

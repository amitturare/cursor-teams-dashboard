import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createGroup, listGroups } from "@/lib/db/queries/groups";

export const dynamic = "force-dynamic";

const CreateGroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional()
});

export async function GET() {
  try {
    const groups = await listGroups();
    return NextResponse.json(groups);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = CreateGroupSchema.parse(body);
    const group = await createGroup(data);
    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

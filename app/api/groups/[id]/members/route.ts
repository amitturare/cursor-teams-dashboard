import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addGroupMembers, removeGroupMembers } from "@/lib/db/queries/groups";

export const dynamic = "force-dynamic";

const MembersSchema = z.object({
  emails: z.array(z.string().email()).min(1)
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { emails } = MembersSchema.parse(body);
    await addGroupMembers(Number(id), emails);
    return NextResponse.json({ added: emails.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { emails } = MembersSchema.parse(body);
    await removeGroupMembers(Number(id), emails);
    return NextResponse.json({ removed: emails.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

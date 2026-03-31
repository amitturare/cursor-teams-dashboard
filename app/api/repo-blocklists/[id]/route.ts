import { NextRequest, NextResponse } from "next/server";

import { deleteRepoBlocklist } from "@/lib/cursor-admin";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteRepoBlocklist(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { error: message, hint: "Verify CURSOR_ADMIN_API_KEY is set and your API key has team admin permissions" },
      { status: 500 }
    );
  }
}

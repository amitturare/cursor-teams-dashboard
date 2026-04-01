import { sql } from "drizzle-orm";
import { db } from "../index";
import { teamMembers } from "../schema";
import type { TeamMember } from "../../cursor-admin";

export async function upsertTeamMembers(members: TeamMember[]): Promise<void> {
  if (members.length === 0) return;
  const now = new Date();

  await db
    .insert(teamMembers)
    .values(
      members.map((m) => ({
        cursorId: String(m.id),
        email: m.email,
        name: m.name ?? null,
        role: m.role ?? null,
        isRemoved: m.role === "removed" || m.isRemoved === true,
        syncedAt: now
      }))
    )
    .onConflictDoUpdate({
      target: [teamMembers.email],
      set: {
        cursorId: sql`excluded.cursor_id`,
        name: sql`excluded.name`,
        role: sql`excluded.role`,
        isRemoved: sql`excluded.is_removed`,
        syncedAt: sql`excluded.synced_at`
      }
    });
}

export async function queryTeamMembers(): Promise<TeamMember[]> {
  const rows = await db.select().from(teamMembers);
  return rows.map((r) => ({
    id: r.cursorId,
    email: r.email,
    name: r.name ?? undefined,
    role: r.role ?? undefined,
    isRemoved: r.isRemoved ?? undefined
  }));
}

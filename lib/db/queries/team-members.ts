import { sql } from "drizzle-orm";
import { db } from "../index";
import { teamMembers } from "../schema";
import type { TeamMember } from "../../cursor-admin";

const TEAM_MEMBERS_UPSERT_BATCH_SIZE = 400;

const teamMembersConflictUpdate = {
  target: [teamMembers.email],
  set: {
    cursorId: sql`excluded.cursor_id`,
    name: sql`excluded.name`,
    role: sql`excluded.role`,
    isRemoved: sql`excluded.is_removed`,
    syncedAt: sql`excluded.synced_at`
  }
};

export async function upsertTeamMembers(members: TeamMember[]): Promise<void> {
  if (members.length === 0) return;
  const now = new Date();

  const values = members.map((m) => ({
    cursorId: String(m.id),
    email: m.email,
    name: m.name ?? null,
    role: m.role ?? null,
    isRemoved: m.role === "removed" || m.isRemoved === true,
    syncedAt: now
  }));

  for (let i = 0; i < values.length; i += TEAM_MEMBERS_UPSERT_BATCH_SIZE) {
    const batch = values.slice(i, i + TEAM_MEMBERS_UPSERT_BATCH_SIZE);
    await db.insert(teamMembers).values(batch).onConflictDoUpdate(teamMembersConflictUpdate);
  }
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

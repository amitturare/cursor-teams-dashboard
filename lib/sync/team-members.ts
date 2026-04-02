import { getTeamMembers } from "../cursor-admin";
import { getStaleDates, markSynced } from "../db/queries/sync-log";
import { upsertTeamMembers, queryTeamMembers } from "../db/queries/team-members";
import type { TeamMember } from "../cursor-admin";

/**
 * Team members are not date-range data; we sync once per day using today as the date key.
 */
export async function syncAndQueryTeamMembers(): Promise<TeamMember[]> {
  const today = new Date().toISOString().slice(0, 10);
  const staleDates = await getStaleDates("team_members", today, today);

  if (staleDates.length > 0) {
    const members = await getTeamMembers();
    await upsertTeamMembers(members);
    await markSynced("team_members", staleDates);
  }

  return queryTeamMembers();
}

import { getTeamSpend } from "../cursor-admin";
import { getStaleDates, markSynced } from "../db/queries/sync-log";
import { upsertTeamSpend, queryTeamSpend } from "../db/queries/spend";

export async function syncAndQuerySpend() {
  const today = new Date().toISOString().slice(0, 10);
  const staleDates = await getStaleDates("team_spend", today, today);

  if (staleDates.length > 0) {
    const { entries, billingCycleStart } = await getTeamSpend();
    await upsertTeamSpend(entries, billingCycleStart);
    await markSynced("team_spend", staleDates);
  }

  return queryTeamSpend();
}

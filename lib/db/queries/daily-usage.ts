import { and, gte, lte, sql } from "drizzle-orm";
import { db } from "../index";
import { dailyUsageRows } from "../schema";
import type { DailyUsageRow } from "../../cursor-admin";

/** Keeps Drizzle insert SQL chunk count small — huge multi-row upserts can overflow the stack. */
const DAILY_USAGE_UPSERT_BATCH_SIZE = 400;

const dailyUsageConflictUpdate = {
  target: [dailyUsageRows.userEmail, dailyUsageRows.date],
  set: {
    userId: sql`excluded.user_id`,
    isActive: sql`excluded.is_active`,
    totalLinesAdded: sql`excluded.total_lines_added`,
    totalLinesDeleted: sql`excluded.total_lines_deleted`,
    acceptedLinesAdded: sql`excluded.accepted_lines_added`,
    acceptedLinesDeleted: sql`excluded.accepted_lines_deleted`,
    totalApplies: sql`excluded.total_applies`,
    totalAccepts: sql`excluded.total_accepts`,
    totalRejects: sql`excluded.total_rejects`,
    totalTabsShown: sql`excluded.total_tabs_shown`,
    totalTabsAccepted: sql`excluded.total_tabs_accepted`,
    composerRequests: sql`excluded.composer_requests`,
    chatRequests: sql`excluded.chat_requests`,
    agentRequests: sql`excluded.agent_requests`,
    cmdkUsages: sql`excluded.cmdk_usages`,
    subscriptionReqs: sql`excluded.subscription_reqs`,
    usageBasedReqs: sql`excluded.usage_based_reqs`,
    apiKeyReqs: sql`excluded.api_key_reqs`,
    bugbotUsages: sql`excluded.bugbot_usages`,
    mostUsedModel: sql`excluded.most_used_model`,
    applyExt: sql`excluded.apply_ext`,
    tabExt: sql`excluded.tab_ext`,
    clientVersion: sql`excluded.client_version`,
    syncedAt: sql`excluded.synced_at`
  }
};

export async function upsertDailyUsageRows(rows: DailyUsageRow[]): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date();

  const values = rows
    .filter((r) => r.email && r.date)
    .map((r) => ({
      userEmail: r.email!,
      date: new Date(r.date).toISOString().slice(0, 10),
      userId: r.userId ?? null,
      isActive: r.isActive ?? null,
      totalLinesAdded: r.totalLinesAdded ?? null,
      totalLinesDeleted: r.totalLinesDeleted ?? null,
      acceptedLinesAdded: r.acceptedLinesAdded ?? null,
      acceptedLinesDeleted: r.acceptedLinesDeleted ?? null,
      totalApplies: r.totalApplies ?? null,
      totalAccepts: r.totalAccepts ?? null,
      totalRejects: r.totalRejects ?? null,
      totalTabsShown: r.totalTabsShown ?? null,
      totalTabsAccepted: r.totalTabsAccepted ?? null,
      composerRequests: r.composerRequests ?? null,
      chatRequests: r.chatRequests ?? null,
      agentRequests: r.agentRequests ?? null,
      cmdkUsages: r.cmdkUsages ?? null,
      subscriptionReqs: r.subscriptionIncludedReqs ?? null,
      usageBasedReqs: r.usageBasedReqs ?? null,
      apiKeyReqs: r.apiKeyReqs ?? null,
      bugbotUsages: r.bugbotUsages ?? null,
      mostUsedModel: r.mostUsedModel ?? null,
      applyExt: r.applyMostUsedExtension ?? null,
      tabExt: r.tabMostUsedExtension ?? null,
      clientVersion: r.clientVersion ?? null,
      syncedAt: now
    }));

  if (values.length === 0) return;

  for (let i = 0; i < values.length; i += DAILY_USAGE_UPSERT_BATCH_SIZE) {
    const batch = values.slice(i, i + DAILY_USAGE_UPSERT_BATCH_SIZE);
    await db.insert(dailyUsageRows).values(batch).onConflictDoUpdate(dailyUsageConflictUpdate);
  }
}

export async function queryDailyUsageRows(startDate: string, endDate: string): Promise<DailyUsageRow[]> {
  const rows = await db
    .select()
    .from(dailyUsageRows)
    .where(and(gte(dailyUsageRows.date, startDate), lte(dailyUsageRows.date, endDate)));

  return rows.map((r) => ({
    date: new Date(r.date).getTime(),
    email: r.userEmail,
    userId: r.userId ?? undefined,
    isActive: r.isActive ?? undefined,
    totalLinesAdded: r.totalLinesAdded ?? undefined,
    totalLinesDeleted: r.totalLinesDeleted ?? undefined,
    acceptedLinesAdded: r.acceptedLinesAdded ?? undefined,
    acceptedLinesDeleted: r.acceptedLinesDeleted ?? undefined,
    totalApplies: r.totalApplies ?? undefined,
    totalAccepts: r.totalAccepts ?? undefined,
    totalRejects: r.totalRejects ?? undefined,
    totalTabsShown: r.totalTabsShown ?? undefined,
    totalTabsAccepted: r.totalTabsAccepted ?? undefined,
    composerRequests: r.composerRequests ?? undefined,
    chatRequests: r.chatRequests ?? undefined,
    agentRequests: r.agentRequests ?? undefined,
    cmdkUsages: r.cmdkUsages ?? undefined,
    subscriptionIncludedReqs: r.subscriptionReqs ?? undefined,
    usageBasedReqs: r.usageBasedReqs ?? undefined,
    apiKeyReqs: r.apiKeyReqs ?? undefined,
    bugbotUsages: r.bugbotUsages ?? undefined,
    mostUsedModel: r.mostUsedModel ?? undefined,
    applyMostUsedExtension: r.applyExt ?? undefined,
    tabMostUsedExtension: r.tabExt ?? undefined,
    clientVersion: r.clientVersion ?? undefined
  }));
}

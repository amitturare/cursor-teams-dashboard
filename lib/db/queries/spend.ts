import { sql } from "drizzle-orm";
import { db } from "../index";
import { teamSpend } from "../schema";
import type { TeamSpendEntry } from "../../cursor-admin";

export async function upsertTeamSpend(entries: TeamSpendEntry[], billingCycleStart: number): Promise<void> {
  if (entries.length === 0) return;
  const now = new Date();
  const cycleDate = billingCycleStart > 0 ? new Date(billingCycleStart) : null;

  await db
    .insert(teamSpend)
    .values(
      entries.map((e) => ({
        userId: e.userId ?? null,
        email: e.email,
        name: e.name ?? null,
        role: e.role ?? null,
        spendCents: e.spendCents ?? null,
        overallSpendCents: e.overallSpendCents ?? null,
        fastPremiumRequests: e.fastPremiumRequests ?? null,
        hardLimitOverrideDollars: e.hardLimitOverrideDollars ?? null,
        monthlyLimitDollars: e.monthlyLimitDollars ?? null,
        billingCycleStart: cycleDate,
        syncedAt: now
      }))
    )
    .onConflictDoUpdate({
      target: [teamSpend.email],
      set: {
        userId: sql`excluded.user_id`,
        name: sql`excluded.name`,
        role: sql`excluded.role`,
        spendCents: sql`excluded.spend_cents`,
        overallSpendCents: sql`excluded.overall_spend_cents`,
        fastPremiumRequests: sql`excluded.fast_premium_requests`,
        hardLimitOverrideDollars: sql`excluded.hard_limit_override_dollars`,
        monthlyLimitDollars: sql`excluded.monthly_limit_dollars`,
        billingCycleStart: sql`excluded.billing_cycle_start`,
        syncedAt: sql`excluded.synced_at`
      }
    });
}

export async function queryTeamSpend(): Promise<Array<TeamSpendEntry & { billingCycleStart?: Date | null }>> {
  const rows = await db.select().from(teamSpend);
  return rows.map((r) => ({
    userId: r.userId ?? undefined,
    email: r.email,
    name: r.name ?? undefined,
    role: r.role ?? undefined,
    spendCents: r.spendCents ?? undefined,
    overallSpendCents: r.overallSpendCents ?? undefined,
    fastPremiumRequests: r.fastPremiumRequests ?? undefined,
    hardLimitOverrideDollars: r.hardLimitOverrideDollars ?? undefined,
    monthlyLimitDollars: r.monthlyLimitDollars ?? undefined,
    billingCycleStart: r.billingCycleStart
  }));
}

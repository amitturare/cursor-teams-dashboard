import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
  unique
} from "drizzle-orm/pg-core";

export const dailyUsageRows = pgTable(
  "daily_usage_rows",
  {
    id: serial("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    date: date("date").notNull(),
    userId: integer("user_id"),
    isActive: boolean("is_active"),
    totalLinesAdded: integer("total_lines_added"),
    totalLinesDeleted: integer("total_lines_deleted"),
    acceptedLinesAdded: integer("accepted_lines_added"),
    acceptedLinesDeleted: integer("accepted_lines_deleted"),
    totalApplies: integer("total_applies"),
    totalAccepts: integer("total_accepts"),
    totalRejects: integer("total_rejects"),
    totalTabsShown: integer("total_tabs_shown"),
    totalTabsAccepted: integer("total_tabs_accepted"),
    composerRequests: integer("composer_requests"),
    chatRequests: integer("chat_requests"),
    agentRequests: integer("agent_requests"),
    cmdkUsages: integer("cmdk_usages"),
    subscriptionReqs: integer("subscription_reqs"),
    usageBasedReqs: integer("usage_based_reqs"),
    apiKeyReqs: integer("api_key_reqs"),
    bugbotUsages: integer("bugbot_usages"),
    mostUsedModel: text("most_used_model"),
    applyExt: text("apply_ext"),
    tabExt: text("tab_ext"),
    clientVersion: text("client_version"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull()
  },
  (t) => [unique().on(t.userEmail, t.date)]
);

export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  cursorId: text("cursor_id").unique().notNull(),
  email: text("email").unique().notNull(),
  name: text("name"),
  role: text("role"),
  isRemoved: boolean("is_removed").default(false),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull()
});

export const usageEvents = pgTable(
  "usage_events",
  {
    id: serial("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    model: text("model"),
    kind: text("kind"),
    data: jsonb("data").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull()
  },
  (t) => [unique().on(t.userEmail, t.timestamp, t.model, t.kind)]
);

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email"),
  eventType: text("event_type"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  data: jsonb("data").notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull()
});

export const syncLog = pgTable(
  "sync_log",
  {
    id: serial("id").primaryKey(),
    dataType: text("data_type").notNull(),
    date: date("date").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull()
  },
  (t) => [unique().on(t.dataType, t.date)]
);

export const teamSettings = pgTable("team_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const userGroups = pgTable("user_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const groupMembers = pgTable(
  "group_members",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .references(() => userGroups.id, { onDelete: "cascade" })
      .notNull(),
    email: text("email").notNull()
  },
  (t) => [unique().on(t.groupId, t.email)]
);

export const teamSpend = pgTable("team_spend", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").unique(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: text("role"),
  spendCents: integer("spend_cents"),
  overallSpendCents: integer("overall_spend_cents"),
  fastPremiumRequests: integer("fast_premium_requests"),
  hardLimitOverrideDollars: integer("hard_limit_override_dollars"),
  monthlyLimitDollars: integer("monthly_limit_dollars"),
  billingCycleStart: timestamp("billing_cycle_start", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull()
});

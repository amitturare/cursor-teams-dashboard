import type { DailyUsageRow, TeamMember, UsageEvent } from "@/lib/cursor-admin";

export interface TimeWindow {
  id: string;
  label: string;
  startDate: number;
  endDate: number;
  totalDays: number;
}

export interface UserWindowMetricRow {
  windowId: string;
  windowLabel: string;
  userEmail: string;
  userName: string;
  role: string;
  favoriteModel: string;
  usageEvents: number;
  usageCount: number;
  requestCostUnits: number;
  totalAiRequests: number;
  productivityScore: number;
  agentEfficiency: number;
  tabEfficiency: number;
  adoptionRate: number;
}

interface Accumulator {
  windowId: string;
  windowLabel: string;
  userEmail: string;
  userName: string;
  role: string;
  usageEvents: number;
  requestCostUnits: number;
  modelCounts: Map<string, number>;
  activeDays: Set<string>;
  totalTabsShown: number;
  totalTabsAccepted: number;
  totalAccepts: number;
  agentRequests: number;
  composerRequests: number;
  chatRequests: number;
  acceptedLinesAdded: number;
  acceptedLinesDeleted: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0);
}

function startOfUtcMonth(date: Date, monthOffset = 0) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1, 0, 0, 0, 0);
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
] as const;

function monthLabelFromStart(startMs: number) {
  const date = new Date(startMs);
  return `${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function dayKey(timestampMs: number) {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function toMs(value: string | number) {
  if (typeof value === "number") {
    return value;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? Date.parse(value) : parsed;
}

function n(value: number | undefined): number {
  return value ?? 0;
}

function pickFavoriteModel(modelCounts: Map<string, number>) {
  let bestModel = "-";
  let bestCount = -1;

  for (const [model, count] of modelCounts.entries()) {
    if (count > bestCount) {
      bestModel = model;
      bestCount = count;
    }
  }

  return bestModel;
}

function resolveDailyUserEmail(row: DailyUsageRow): string | null {
  const possible = [row.userEmail, row.memberEmail, row.email];

  for (const value of possible) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

function getOrCreate(
  map: Map<string, Accumulator>,
  windowId: string,
  windowLabel: string,
  userEmail: string,
  userName: string,
  role: string
) {
  const key = `${windowId}::${userEmail}`;
  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const next: Accumulator = {
    windowId,
    windowLabel,
    userEmail,
    userName,
    role,
    usageEvents: 0,
    requestCostUnits: 0,
    modelCounts: new Map<string, number>(),
    activeDays: new Set<string>(),
    totalTabsShown: 0,
    totalTabsAccepted: 0,
    totalAccepts: 0,
    agentRequests: 0,
    composerRequests: 0,
    chatRequests: 0,
    acceptedLinesAdded: 0,
    acceptedLinesDeleted: 0
  };

  map.set(key, next);
  return next;
}

export function getSelectableWindows(monthsBack = 12): TimeWindow[] {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const currentMonthStart = startOfUtcMonth(now);
  const nextMonthStart = startOfUtcMonth(now, 1);
  const oneDayMs = 24 * 60 * 60 * 1000;

  const baseWindows: TimeWindow[] = [
    {
      id: "past-7d",
      label: "Past 7D",
      startDate: todayStart - 6 * oneDayMs,
      endDate: todayStart + oneDayMs,
      totalDays: 7
    },
    {
      id: "past-30d",
      label: "Past 30D",
      startDate: todayStart - 29 * oneDayMs,
      endDate: todayStart + oneDayMs,
      totalDays: 30
    },
    {
      id: "current-month",
      label: "Current Month",
      startDate: currentMonthStart,
      endDate: nextMonthStart,
      totalDays: Math.round((nextMonthStart - currentMonthStart) / oneDayMs)
    }
  ];

  const monthWindows: TimeWindow[] = [];
  const clampedMonthsBack = clamp(monthsBack, 1, 24);

  for (let offset = 1; offset <= clampedMonthsBack; offset += 1) {
    const start = startOfUtcMonth(now, -offset);
    const end = startOfUtcMonth(now, -offset + 1);
    monthWindows.push({
      id: `month-${monthLabelFromStart(start)}`,
      label: monthLabelFromStart(start),
      startDate: start,
      endDate: end,
      totalDays: Math.round((end - start) / oneDayMs)
    });
  }

  return [...baseWindows, ...monthWindows];
}

export function resolveWindowSelection(windowId: string | undefined) {
  const windows = getSelectableWindows();
  const fallback = windows[0];

  if (!windowId) {
    return fallback;
  }

  return windows.find((window) => window.id === windowId) || fallback;
}

export function buildUserWindowMetrics(params: {
  teamMembers: TeamMember[];
  dailyUsageData: DailyUsageRow[];
  usageEvents: UsageEvent[];
  window: TimeWindow;
}): UserWindowMetricRow[] {
  const membersByEmail = new Map(params.teamMembers.map((member) => [member.email, member]));
  const acc = new Map<string, Accumulator>();

  for (const member of params.teamMembers) {
    getOrCreate(
      acc,
      params.window.id,
      params.window.label,
      member.email,
      member.name || member.email,
      member.role || "member"
    );
  }

  for (const event of params.usageEvents) {
    if (!event.userEmail) {
      continue;
    }

    const eventMs = toMs(event.timestamp);
    if (eventMs < params.window.startDate || eventMs >= params.window.endDate) {
      continue;
    }

    const member = membersByEmail.get(event.userEmail);
    const target = getOrCreate(
      acc,
      params.window.id,
      params.window.label,
      event.userEmail,
      member?.name || event.userEmail,
      member?.role || "member"
    );

    target.usageEvents += 1;
    target.requestCostUnits += n(event.requestsCosts);

    const model = event.model || "unknown";
    const current = target.modelCounts.get(model) || 0;
    target.modelCounts.set(model, current + 1);
  }

  for (const row of params.dailyUsageData) {
    const email = resolveDailyUserEmail(row);
    if (!email) {
      continue;
    }

    if (row.date < params.window.startDate || row.date >= params.window.endDate) {
      continue;
    }

    const member = membersByEmail.get(email);
    const target = getOrCreate(
      acc,
      params.window.id,
      params.window.label,
      email,
      member?.name || email,
      member?.role || "member"
    );

    target.totalTabsShown += n(row.totalTabsShown);
    target.totalTabsAccepted += n(row.totalTabsAccepted);
    target.totalAccepts += n(row.totalAccepts);
    target.agentRequests += n(row.agentRequests);
    target.composerRequests += n(row.composerRequests);
    target.chatRequests += n(row.chatRequests);
    target.acceptedLinesAdded += n(row.acceptedLinesAdded);
    target.acceptedLinesDeleted += n(row.acceptedLinesDeleted);

    if (row.mostUsedModel) {
      const current = target.modelCounts.get(row.mostUsedModel) || 0;
      target.modelCounts.set(row.mostUsedModel, current + 1);
    }

    if (row.isActive) {
      target.activeDays.add(dayKey(row.date));
    }
  }

  return Array.from(acc.values())
    .map((item): UserWindowMetricRow => {
      const totalAiRequests = item.agentRequests + item.composerRequests + item.chatRequests;
      const acceptedLines = item.acceptedLinesAdded + item.acceptedLinesDeleted;

      return {
        windowId: item.windowId,
        windowLabel: item.windowLabel,
        userEmail: item.userEmail,
        userName: item.userName,
        role: item.role,
        favoriteModel: pickFavoriteModel(item.modelCounts),
        usageEvents: item.usageEvents,
        usageCount: totalAiRequests,
        requestCostUnits: Number(item.requestCostUnits.toFixed(2)),
        totalAiRequests,
        productivityScore: Number((acceptedLines / Math.max(totalAiRequests, 1)).toFixed(2)),
        agentEfficiency: Number((item.totalAccepts / Math.max(item.agentRequests, 1)).toFixed(2)),
        tabEfficiency: Number((item.totalTabsAccepted / Math.max(item.totalTabsShown, 1)).toFixed(2)),
        adoptionRate: Number((item.activeDays.size / Math.max(params.window.totalDays, 1)).toFixed(2))
      };
    })
    .sort((a, b) => a.userEmail.localeCompare(b.userEmail));
}

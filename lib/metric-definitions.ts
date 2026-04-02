export interface MetricDefinition {
  name: string;
  unit: string;
  tagline: string;
  formula: string;
  source: string;
  interpret: string;
  warning?: string;
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    name: "Usage",
    unit: "requests",
    tagline: "Total number of AI interactions made during the selected window",
    formula: "agentRequests + composerRequests + chatRequests + cmdkUsages, summed across all days",
    source: "Four daily counters from /teams/daily-usage-data: agentRequests, composerRequests, chatRequests, cmdkUsages",
    interpret:
      "The clearest signal of AI engagement. Higher = more interactions. Does not measure code quality or acceptance — just how much the user reached for AI assistance."
  },
  {
    name: "Productivity Score",
    unit: "lines / request",
    tagline: "Lines of AI-suggested code accepted per request — did the AI save real work?",
    formula: "(acceptedLinesAdded + acceptedLinesDeleted) ÷ (agentRequests + composerRequests + chatRequests)",
    source: "acceptedLinesAdded, acceptedLinesDeleted, agentRequests, composerRequests, chatRequests from /teams/daily-usage-data",
    interpret:
      "A score of 34 means ~34 lines of AI output were kept per request on average. 0 means requests were made but nothing was accepted. Scores above 50 are strong; very high scores (100+) often come from Agent mode scaffolding large files."
  },
  {
    name: "Agent Efficiency",
    unit: "%",
    tagline: "How often the user kept the Agent's output — a signal of agent trust and quality",
    formula: "totalAccepts ÷ agentRequests × 100",
    source: "totalAccepts and agentRequests from /teams/daily-usage-data",
    interpret:
      "67% means the agent's result was accepted 2 out of 3 times. Under 30% often means exploratory use or the agent isn't aligned to the codebase style. High efficiency (70%+) suggests the user and agent work well together."
  },
  {
    name: "Tab Efficiency",
    unit: "%",
    tagline: "How often Tab (autocomplete) suggestions were accepted when shown",
    formula: "totalTabsAccepted ÷ totalTabsShown × 100",
    source: "totalTabsAccepted and totalTabsShown from /teams/daily-usage-data",
    interpret:
      "Autocomplete fires on every keypress, so rates are naturally lower than Agent efficiency. 10–15% is typical; above 25% is excellent. Very low rates (<5%) may mean the user dismisses suggestions habitually."
  },
  {
    name: "Adoption Rate",
    unit: "%",
    tagline: "How consistently the user engaged with Cursor AI across the window — daily habit vs. occasional use",
    formula: "Days where isActive = true ÷ total days in window × 100",
    source: "isActive boolean from /teams/daily-usage-data — true when the user made at least one AI request that day",
    interpret:
      "100% means AI was used every single day. 43% on a 7-day window means 3 active days. A user can have high Usage but low Adoption (heavy use on select days)."
  },
  {
    name: "Favorite Model",
    unit: "model name",
    tagline: "The AI model this user relied on most during the selected period",
    formula: "Most frequently appearing model across all daily rows in the window",
    source: "mostUsedModel field from /teams/daily-usage-data, recorded per user per day",
    interpret:
      "'default' means Cursor auto-selected the model. Named models (e.g. claude-4-sonnet-thinking, gpt-4o) mean the user explicitly switched."
  },
  {
    name: "Overall Score",
    unit: "score 0–100",
    tagline: "A balanced composite of all five engagement and quality signals",
    formula:
      "(adoptionRate × 0.30 + tabEfficiency × 0.20 + agentEfficiency × 0.20 + min(productivityScore/100, 1) × 0.20 + usageNorm × 0.10) × 100  where usageNorm = usageCount ÷ max(usageCount across team)",
    source: "All fields from /teams/daily-usage-data via computed metrics",
    interpret:
      "75–100 = Excellent: consistent, high-quality AI usage. 50–74 = Good: solid adopter with room to improve. 25–49 = Fair: occasional or low-quality usage. 0–24 = Low: minimal AI integration."
  },
  {
    name: "AI Code Acceptance",
    unit: "accepted lines / day, prompts / day",
    tagline: "Daily AI-suggested code that was kept, plotted against total prompts made",
    formula:
      "Bars: acceptedLinesAdded + acceptedLinesDeleted per day. Line: agentRequests + composerRequests + chatRequests + cmdkUsages per day",
    source: "acceptedLinesAdded, acceptedLinesDeleted, agentRequests, composerRequests, chatRequests, cmdkUsages from /teams/daily-usage-data",
    interpret:
      "High bars with low line = AI output is high quality and accepted efficiently. High line with low bars = many prompts but little accepted code — signals friction or exploratory usage."
  },
  {
    name: "Quota Utilisation",
    unit: "requests (billing cycle)",
    tagline:
      "Per-member `fastPremiumRequests` from team spend vs. your cap reference setting (anomaly coloring only)",
    formula:
      "POST /teams/spend — `fastPremiumRequests` per member; top 10 by count (visible cohort). Red highlight if count > 50% of team `quota_cap` and today (UTC) is in the first 10 calendar days after `subscriptionCycleStart`",
    source: "`fastPremiumRequests` on each `teamMemberSpend` row from POST /teams/spend (synced via GET /api/spend)",
    interpret:
      "Taller violet bars = more usage-based premium requests this billing cycle for that person. Red only if usage exceeds 50% of your cap reference (team setting) while the current date (UTC) is within the first 10 calendar days of that billing cycle.",
    warning:
      "Cap reference is a team setting for visualization only, not Cursor’s official plan ceiling. Billing cycle start comes from spend (`subscriptionCycleStart`)."
  }
];

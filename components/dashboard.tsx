"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { UserWindowMetricRow as MetricRow } from "@/lib/metrics";
import { QuartileBarChart } from "@/components/widgets/QuartileBarChart";
import { PlaceholderPanel } from "@/components/widgets/PlaceholderPanel";
import {
	type WidgetMetric,
	type WidgetMetricAssignment,
	getBand,
	getMetricMax,
} from "@/components/widgets/quartile-utils";

interface MetricDefinition {
	name: string;
	tagline: string;
	formula: string;
	source: string;
	interpret: string;
}

interface ApiResponse {
	generatedAt: string;
	rows: MetricRow[];
	definitions: MetricDefinition[];
	cached?: boolean;
	selectedWindow: { id: string; label: string; startDate: number; endDate: number };
	availableWindows: Array<{ id: string; label: string }>;
}

interface UserRecord {
	email: string;
	name: string;
	role: string;
	isRemoved: boolean;
}

interface UserGroup {
	id: string;
	name: string;
	userEmails: string[];
}

type FilterCategory = "all" | "groups" | "individuals";

interface WidgetState {
  metric: WidgetMetric;
  selectedBand: 0 | 1 | 2 | 3 | null;
}

interface UsageEventItem {
	timestamp: string | number;
	model?: string;
	kind?: string;
	maxMode?: boolean;
	chargedCents?: number;
	isFreeBugbot?: boolean;
	userEmail?: string;
}

interface UsageEventsResponse {
	events: UsageEventItem[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

interface AuditLogEntry {
	timestamp?: string;
	userEmail?: string;
	eventType?: string;
	details?: Record<string, unknown>;
}

interface AuditLogsResponse {
	logs: AuditLogEntry[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

interface RepoBlocklistEntry {
	id: string;
	url: string;
	patterns: string[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map<string, { data: ApiResponse; fetchedAt: number }>();
const inflightRequests = new Map<string, Promise<ApiResponse>>();
const GROUPS_KEY = "cursor-dashboard-user-groups";

function pct(value: number) {
	return `${(value * 100).toFixed(0)}%`;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function formatDateRange(startMs: number | undefined, endMs: number | undefined): string {
	if (!startMs || !endMs || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return "";
	const start = new Date(startMs);
	const end = new Date(endMs - 1);
	const sMonth = SHORT_MONTHS[start.getUTCMonth()];
	const sDay = start.getUTCDate();
	const sYear = start.getUTCFullYear();
	const eMonth = SHORT_MONTHS[end.getUTCMonth()];
	const eDay = end.getUTCDate();
	const eYear = end.getUTCFullYear();
	if (sYear === eYear && sMonth === eMonth) return `${sMonth} ${sDay} – ${eDay}, ${sYear}`;
	if (sYear === eYear) return `${sMonth} ${sDay} – ${eMonth} ${eDay}, ${sYear}`;
	return `${sMonth} ${sDay}, ${sYear} – ${eMonth} ${eDay}, ${eYear}`;
}

function createGroupId() {
	return crypto.randomUUID();
}

async function loadMetrics(windowId: string): Promise<ApiResponse> {
	const cached = responseCache.get(windowId);
	if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;
	const existingRequest = inflightRequests.get(windowId);
	if (existingRequest) return existingRequest;
	const request = fetch(`/api/team-metrics?window=${windowId}`, { cache: "no-store" })
		.then(async (response) => {
			if (!response.ok) {
				const body = (await response.json()) as { error?: string };
				throw new Error(body.error || `Request failed with ${response.status}`);
			}
			const body = (await response.json()) as ApiResponse;
			responseCache.set(windowId, { data: body, fetchedAt: Date.now() });
			return body;
		})
		.finally(() => {
			inflightRequests.delete(windowId);
		});
	inflightRequests.set(windowId, request);
	return request;
}

async function loadUsageEvents(
	email: string,
	startDate: number,
	endDate: number,
	page: number
): Promise<UsageEventsResponse> {
	const params = new URLSearchParams({
		email,
		startDate: String(startDate),
		endDate: String(endDate),
		page: String(page),
		pageSize: "50"
	});
	const response = await fetch(`/api/usage-events?${params}`, { cache: "no-store" });
	if (!response.ok) {
		const body = (await response.json()) as { error?: string };
		throw new Error(body.error || `Request failed with ${response.status}`);
	}
	return response.json() as Promise<UsageEventsResponse>;
}

async function loadAuditLogs(
	windowId: string,
	search: string,
	eventTypes: string,
	page: number
): Promise<AuditLogsResponse> {
	const params = new URLSearchParams({ window: windowId, page: String(page) });
	if (search) params.set("search", search);
	if (eventTypes) params.set("eventTypes", eventTypes);
	const response = await fetch(`/api/audit-logs?${params}`, { cache: "no-store" });
	if (!response.ok) {
		const body = (await response.json()) as { error?: string };
		throw new Error(body.error || `Request failed with ${response.status}`);
	}
	return response.json() as Promise<AuditLogsResponse>;
}

async function fetchRepoBlocklistsApi(): Promise<RepoBlocklistEntry[]> {
	const response = await fetch("/api/repo-blocklists", { cache: "no-store" });
	if (!response.ok) {
		const body = (await response.json()) as { error?: string };
		throw new Error(body.error || `Request failed with ${response.status}`);
	}
	const body = (await response.json()) as { repos: RepoBlocklistEntry[] };
	return body.repos;
}

function nameFromEmail(email: string): string {
	const local = email.split("@")[0] || email;
	return local
		.split(/[._-]/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join(" ");
}

function resolveUserName(name: string | undefined, email: string): string {
	if (name && name.trim().length > 0 && name !== email) return name;
	return nameFromEmail(email);
}

function sanitizeGroups(groups: UserGroup[], validEmails: Set<string>) {
	return groups
		.filter((group) => !isSystemGroup(group.id))
		.map((group) => ({
			...group,
			userEmails: group.userEmails.filter((email) => validEmails.has(email)),
		}))
		.filter((group) => group.name.trim().length > 0 && group.userEmails.length > 0);
}

const SYSTEM_REMOVED_GROUP_ID = "system-removed-users";
const SYSTEM_REMOVED_GROUP_NAME = "Removed";
const SYSTEM_MEMBER_GROUP_ID = "system-member-users";
const SYSTEM_MEMBER_GROUP_NAME = "Member";

function isSystemGroup(groupId: string) {
	return groupId === SYSTEM_REMOVED_GROUP_ID || groupId === SYSTEM_MEMBER_GROUP_ID;
}

/**
 * Rebuilds both system groups ("Member" and "Removed") from the current user list.
 * - "Removed": all isRemoved users (auto-managed, read-only)
 * - "Member": all non-removed users not assigned to any custom group (auto-managed, read-only)
 * Custom groups are preserved; removed emails are stripped from them.
 */
function applySystemGroupsSync(groups: UserGroup[], users: UserRecord[]): UserGroup[] {
	const removedEmails = users.filter((u) => u.isRemoved).map((u) => u.email).sort();
	const removedSet = new Set(removedEmails);

	const customGroups = groups
		.filter((g) => !isSystemGroup(g.id))
		.map((g) => ({ ...g, userEmails: g.userEmails.filter((e) => !removedSet.has(e)) }));

	const memberEmails = users
		.filter((u) => !u.isRemoved)
		.map((u) => u.email)
		.sort();

	const result: UserGroup[] = [];
	if (memberEmails.length > 0) {
		result.push({ id: SYSTEM_MEMBER_GROUP_ID, name: SYSTEM_MEMBER_GROUP_NAME, userEmails: memberEmails });
	}
	if (removedEmails.length > 0) {
		result.push({ id: SYSTEM_REMOVED_GROUP_ID, name: SYSTEM_REMOVED_GROUP_NAME, userEmails: removedEmails });
	}
	return [...result, ...customGroups];
}

function addUsersToGroup(groups: UserGroup[], emails: string[], targetGroupId: string): UserGroup[] {
	return groups.map((group) => {
		if (isSystemGroup(group.id) || group.id !== targetGroupId) return group;
		return { ...group, userEmails: Array.from(new Set([...group.userEmails, ...emails])).sort() };
	});
}

function Sparkline({ points, width = 80, height = 24 }: { points: MetricRow["dailyTrend"]; width?: number; height?: number }) {
	if (points.length < 2) return <span className="muted tiny">—</span>;
	const maxCount = Math.max(...points.map((p) => p.usageCount), 1);
	const step = width / (points.length - 1);
	const pathPoints = points.map((p, i) => {
		const x = i * step;
		const y = height - (p.usageCount / maxCount) * (height - 2) - 1;
		return `${x.toFixed(1)},${y.toFixed(1)}`;
	});
	return (
		<svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="sparkline">
			<polyline points={pathPoints.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
		</svg>
	);
}


export function Dashboard() {
	const [windowId, setWindowId] = useState("past-7d");
	const [activeTab, setActiveTab] = useState<"analytics" | "users" | "definitions" | "audit" | "security">("analytics");
	const [filterCategory, setFilterCategory] = useState<FilterCategory>("all");
	const [filterGroupNames, setFilterGroupNames] = useState<string[]>([]);
	const [filterIndividualEmails, setFilterIndividualEmails] = useState<string[]>([]);
	const [isFilterOpen, setIsFilterOpen] = useState(false);
	const [filterSearch, setFilterSearch] = useState("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [data, setData] = useState<ApiResponse | null>(null);
	const [groups, setGroups] = useState<UserGroup[]>([]);
	const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
	const [bulkEmails, setBulkEmails] = useState("");
	const [bulkStatus, setBulkStatus] = useState<string | null>(null);
	const [preferencesReady, setPreferencesReady] = useState(false);
	const [widgets, setWidgets] = useState<[WidgetState, WidgetState, WidgetState, WidgetState]>([
		{ metric: "usageCount", selectedBand: null },
		{ metric: "productivityScore", selectedBand: null },
		{ metric: "agentEfficiency", selectedBand: null },
		{ metric: "adoptionRate", selectedBand: null },
	]);
	// Feature 2 — Drill-down
	const [drillDownEmail, setDrillDownEmail] = useState<string | null>(null);
	const [drillDownEvents, setDrillDownEvents] = useState<UsageEventItem[]>([]);
	const [drillDownLoading, setDrillDownLoading] = useState(false);
	const [drillDownError, setDrillDownError] = useState<string | null>(null);
	const [drillDownPage, setDrillDownPage] = useState(1);
	const [drillDownTotal, setDrillDownTotal] = useState(0);
	const [drillDownTotalPages, setDrillDownTotalPages] = useState(1);
	// Feature 4 — Audit Log
	const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
	const [auditLoading, setAuditLoading] = useState(false);
	const [auditError, setAuditError] = useState<string | null>(null);
	const [auditSearchInput, setAuditSearchInput] = useState("");
	const [auditSearch, setAuditSearch] = useState("");
	const [auditEventTypes, setAuditEventTypes] = useState("");
	const [auditPage, setAuditPage] = useState(1);
	const [auditTotal, setAuditTotal] = useState(0);
	const [auditTotalPages, setAuditTotalPages] = useState(1);
	// Feature 5 — Repo Blocklist
	const [repoBlocklists, setRepoBlocklists] = useState<RepoBlocklistEntry[]>([]);
	const [securityLoading, setSecurityLoading] = useState(false);
	const [securityError, setSecurityError] = useState<string | null>(null);
	const [newRepoUrl, setNewRepoUrl] = useState("");
	const [newRepoPatterns, setNewRepoPatterns] = useState("");
	const [securityMutating, setSecurityMutating] = useState(false);
	const [securityMutateError, setSecurityMutateError] = useState<string | null>(null);
	const filterRef = useRef<HTMLDivElement>(null);
	const filterSearchRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!isFilterOpen) return;
		function handlePointerDown(event: MouseEvent) {
			if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
				setIsFilterOpen(false);
			}
		}
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") setIsFilterOpen(false);
		}
		document.addEventListener("mousedown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("mousedown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isFilterOpen]);

	useEffect(() => {
		if (isFilterOpen) {
			requestAnimationFrame(() => filterSearchRef.current?.focus());
		}
	}, [isFilterOpen]);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				setLoading(true);
				setError(null);
				const body = await loadMetrics(windowId);
				if (!cancelled) setData(body);
			} catch (err) {
				if (!cancelled) setError(err instanceof Error ? err.message : "Unexpected error");
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [windowId]);

	// Reset widget band selections when time window or filter changes
	useEffect(() => {
		setWidgets((prev) =>
			prev.map((w) => ({ ...w, selectedBand: null })) as [WidgetState, WidgetState, WidgetState, WidgetState]
		);
	}, [windowId, filterCategory, filterGroupNames, filterIndividualEmails]);

	// Feature 2 — clear drill-down data when user (or open state) changes so totals never show the previous user
	useEffect(() => {
		setDrillDownEvents([]);
		setDrillDownTotal(0);
		setDrillDownTotalPages(1);
		setDrillDownError(null);
		if (!drillDownEmail) setDrillDownPage(1);
	}, [drillDownEmail]);

	// Feature 2 — load usage events when drillDownEmail or page changes
	useEffect(() => {
		if (!drillDownEmail || !data?.selectedWindow) return;
		let cancelled = false;
		async function loadEvents() {
			setDrillDownLoading(true);
			setDrillDownError(null);
			try {
				const result = await loadUsageEvents(
					drillDownEmail!,
					data!.selectedWindow.startDate,
					data!.selectedWindow.endDate,
					drillDownPage
				);
				if (!cancelled) {
					setDrillDownEvents(result.events);
					setDrillDownTotal(result.total);
					setDrillDownTotalPages(result.totalPages);
				}
			} catch (err) {
				if (!cancelled) setDrillDownError(err instanceof Error ? err.message : "Failed to load events");
			} finally {
				if (!cancelled) setDrillDownLoading(false);
			}
		}
		loadEvents();
		return () => { cancelled = true; };
	}, [drillDownEmail, drillDownPage, data?.selectedWindow]);

	// Feature 2 — close drill-down on Escape
	useEffect(() => {
		if (!drillDownEmail) return;
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") setDrillDownEmail(null);
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [drillDownEmail]);

	// Feature 4 — debounce audit search input
	useEffect(() => {
		const timer = setTimeout(() => {
			setAuditSearch(auditSearchInput);
			setAuditPage(1);
		}, 400);
		return () => clearTimeout(timer);
	}, [auditSearchInput]);

	// Feature 4 — load audit logs when tab/window/search/page changes
	useEffect(() => {
		if (activeTab !== "audit") return;
		let cancelled = false;
		async function loadLogs() {
			setAuditLoading(true);
			setAuditError(null);
			try {
				const result = await loadAuditLogs(windowId, auditSearch, auditEventTypes, auditPage);
				if (!cancelled) {
					setAuditLogs(result.logs);
					setAuditTotal(result.total);
					setAuditTotalPages(result.totalPages);
				}
			} catch (err) {
				if (!cancelled) setAuditError(err instanceof Error ? err.message : "Failed to load audit logs");
			} finally {
				if (!cancelled) setAuditLoading(false);
			}
		}
		loadLogs();
		return () => { cancelled = true; };
	}, [activeTab, windowId, auditSearch, auditEventTypes, auditPage]);

	// Feature 5 — load repo blocklists when security tab opens
	useEffect(() => {
		if (activeTab !== "security") return;
		let cancelled = false;
		async function loadBlocklists() {
			setSecurityLoading(true);
			setSecurityError(null);
			try {
				const repos = await fetchRepoBlocklistsApi();
				if (!cancelled) setRepoBlocklists(repos);
			} catch (err) {
				if (!cancelled) setSecurityError(err instanceof Error ? err.message : "Failed to load blocklists");
			} finally {
				if (!cancelled) setSecurityLoading(false);
			}
		}
		loadBlocklists();
		return () => { cancelled = true; };
	}, [activeTab]);

	const rows = useMemo(() => data?.rows ?? [], [data]);
	const definitions = useMemo(() => data?.definitions ?? [], [data]);
	const windows = useMemo(() => data?.availableWindows ?? [], [data]);
	const windowLabelMap = useMemo(
		() =>
			new Map<string, string>([
				["past-7d", "7D"],
				["past-30d", "30D"],
				["current-month", "Current Month"],
			]),
		[],
	);
	const presetWindows = useMemo(
		() => windows.filter((w) => ["past-7d", "past-30d", "current-month"].includes(w.id)),
		[windows],
	);
	const monthWindows = useMemo(() => windows.filter((w) => w.id.startsWith("month-")), [windows]);
	const monthWindowId = windowId.startsWith("month-") ? windowId : (monthWindows[0]?.id ?? "");

	const users = useMemo<UserRecord[]>(() => {
		const map = new Map<string, UserRecord>();
		for (const row of rows) {
			if (!map.has(row.userEmail)) {
				map.set(row.userEmail, {
					email: row.userEmail,
					name: resolveUserName(row.userName, row.userEmail),
					role: row.isRemoved ? "Removed" : row.role,
					isRemoved: row.isRemoved,
				});
			}
		}
		return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
	}, [rows]);
	const usersByEmail = useMemo(() => new Map(users.map((u) => [u.email.toLowerCase(), u])), [users]);

	useEffect(() => {
		if (users.length === 0) return;
		const validEmails = new Set(users.map((u) => u.email));
		if (!preferencesReady) {
			let nextGroups: UserGroup[] = [];
			try {
				const rawGroups = window.localStorage.getItem(GROUPS_KEY);
				if (rawGroups) {
					nextGroups = sanitizeGroups(JSON.parse(rawGroups) as UserGroup[], validEmails);
				}
			} catch {
				nextGroups = [];
			}
			nextGroups = applySystemGroupsSync(nextGroups, users);
			setGroups(nextGroups);
			setActiveGroupId(nextGroups[0]?.id ?? null);
			setPreferencesReady(true);
			return;
		}
		setGroups((current) => applySystemGroupsSync(sanitizeGroups(current, validEmails), users));
	}, [users, preferencesReady]);

	useEffect(() => {
		if (!preferencesReady) return;
		try {
			window.localStorage.setItem(GROUPS_KEY, JSON.stringify(groups.filter((g) => !isSystemGroup(g.id))));
		} catch {
			// storage unavailable or full — groups won't persist this session
		}
	}, [groups, preferencesReady]);

	useEffect(() => {
		if (!activeGroupId) return;
		if (!groups.some((g) => g.id === activeGroupId)) {
			setActiveGroupId(groups[0]?.id ?? null);
		}
	}, [groups, activeGroupId]);

	/** True when every team member is selected as individuals (same effect as no filter). */
	const isIndividualSelectionFullRoster = useMemo(() => {
		if (filterCategory !== "individuals") return false;
		if (users.length === 0) return filterIndividualEmails.length === 0;
		if (filterIndividualEmails.length !== users.length) return false;
		const selected = new Set(filterIndividualEmails.map((e) => e.toLowerCase()));
		return users.every((u) => selected.has(u.email.toLowerCase()));
	}, [filterCategory, filterIndividualEmails, users]);

	/** True when selected groups cover exactly the full team roster (union equals all users). */
	const isGroupsSelectionFullRoster = useMemo(() => {
		if (filterCategory !== "groups" || filterGroupNames.length === 0) return false;
		const union = new Set<string>();
		for (const g of groups) {
			if (!filterGroupNames.includes(g.name)) continue;
			for (const e of g.userEmails) union.add(e.toLowerCase());
		}
		if (users.length === 0) return true;
		if (union.size !== users.length) return false;
		return users.every((u) => union.has(u.email.toLowerCase()));
	}, [filterCategory, filterGroupNames, groups, users]);

	const isFilterEquivalentToAllUsers = isIndividualSelectionFullRoster || isGroupsSelectionFullRoster;

	const hasActiveFilter =
		filterCategory !== "all" &&
		(filterGroupNames.length > 0 || filterIndividualEmails.length > 0) &&
		!isFilterEquivalentToAllUsers;

	const analyticsRows = useMemo(() => {
		if (filterCategory === "all") return rows;
		if (filterCategory === "groups" && filterGroupNames.length > 0) {
			const matchingEmails = new Set(
				groups.filter((g) => filterGroupNames.includes(g.name)).flatMap((g) => g.userEmails),
			);
			return rows.filter((r) => matchingEmails.has(r.userEmail));
		}
		if (filterCategory === "individuals" && filterIndividualEmails.length > 0) {
			const emailSet = new Set(filterIndividualEmails);
			return rows.filter((r) => emailSet.has(r.userEmail));
		}
		return rows;
	}, [rows, filterCategory, filterGroupNames, filterIndividualEmails, groups]);

	const effectiveRows = useMemo(() => {
		const activeWidgets = widgets.filter((w) => w.selectedBand !== null);
		if (activeWidgets.length === 0) return analyticsRows;
		// Hoist max computation outside the per-row filter loop
		const maxByMetric = new Map(
			activeWidgets.map((w) => [w.metric, getMetricMax(analyticsRows, w.metric)])
		);
		return analyticsRows.filter((row) =>
			activeWidgets.every((w) => {
				const max = maxByMetric.get(w.metric) ?? 0;
				return getBand(row[w.metric], w.metric, max) === w.selectedBand;
			})
		);
	}, [analyticsRows, widgets]);

	const analyticsUserCount = effectiveRows.length;
	const isShowingAll = !hasActiveFilter;

	const teamRollup = useMemo(() => {
		return effectiveRows.reduce(
			(acc, row) => {
				acc.usageCount += row.usageCount;
				acc.productivity += row.productivityScore;
				acc.agentEfficiency += row.agentEfficiency;
				acc.tabEfficiency += row.tabEfficiency;
				acc.adoption += row.adoptionRate;
				return acc;
			},
			{ usageCount: 0, productivity: 0, agentEfficiency: 0, tabEfficiency: 0, adoption: 0 },
		);
	}, [effectiveRows]);

	const rowCount = Math.max(effectiveRows.length, 1);
	const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;

	const filteredPopoverUsers = useMemo(() => {
		if (!filterSearch.trim()) return users;
		const term = filterSearch.toLowerCase();
		return users.filter((u) => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term));
	}, [users, filterSearch]);

	function toggleFilterGroup(groupName: string) {
		setFilterCategory("groups");
		setFilterIndividualEmails([]);
		setFilterGroupNames((current) =>
			current.includes(groupName) ? current.filter((n) => n !== groupName) : [...current, groupName],
		);
	}

	function toggleFilterIndividual(email: string) {
		setFilterCategory("individuals");
		setFilterGroupNames([]);
		setFilterIndividualEmails((current) =>
			current.includes(email) ? current.filter((e) => e !== email) : [...current, email],
		);
	}

	function clearFilter() {
		setFilterCategory("all");
		setFilterGroupNames([]);
		setFilterIndividualEmails([]);
		setFilterSearch("");
	}

	function removeFilterChip(type: "group" | "individual", value: string) {
		if (type === "group") {
			setFilterGroupNames((current) => {
				const next = current.filter((n) => n !== value);
				if (next.length === 0) setFilterCategory("all");
				return next;
			});
		} else {
			setFilterIndividualEmails((current) => {
				const next = current.filter((e) => e !== value);
				if (next.length === 0) setFilterCategory("all");
				return next;
			});
		}
	}

	function getFilterSummary(): string {
		if (isFilterEquivalentToAllUsers) return "All Users";
		if (filterCategory === "groups" && filterGroupNames.length > 0) {
			if (filterGroupNames.length === 1) return filterGroupNames[0];
			return `${filterGroupNames.length} Groups`;
		}
		if (filterCategory === "individuals" && filterIndividualEmails.length > 0) {
			if (filterIndividualEmails.length === 1) {
				const match = users.find((u) => u.email === filterIndividualEmails[0]);
				return match?.name || filterIndividualEmails[0];
			}
			return `${filterIndividualEmails.length} People`;
		}
		return "All Users";
	}

	function assignUserToGroup(email: string, groupId: string) {
		setGroups((current) => applySystemGroupsSync(addUsersToGroup(current, [email], groupId), users));
	}

	function clearUserGroup(email: string) {
		setGroups((current) => {
			const cleared = current.map((group) =>
				isSystemGroup(group.id) ? group : { ...group, userEmails: group.userEmails.filter((item) => item !== email) },
			);
			return applySystemGroupsSync(cleared, users);
		});
	}

	function addGroup() {
		const customCount = groups.filter((g) => !isSystemGroup(g.id)).length;
		const nextGroup: UserGroup = { id: createGroupId(), name: `Group ${customCount + 1}`, userEmails: [] };
		setGroups((current) => [...current, nextGroup]);
		setActiveGroupId(nextGroup.id);
	}

	function renameActiveGroup(name: string) {
		if (!activeGroupId || isSystemGroup(activeGroupId)) return;
		setGroups((current) => current.map((g) => (g.id === activeGroupId ? { ...g, name } : g)));
	}

	function deleteGroup(groupId: string) {
		if (isSystemGroup(groupId)) return;
		const deletedGroup = groups.find((g) => g.id === groupId);
		setGroups((current) => {
			const filtered = current.filter((g) => g.id !== groupId);
			return applySystemGroupsSync(filtered, users);
		});
		setBulkStatus(null);
		setBulkEmails("");
		if (deletedGroup && filterGroupNames.includes(deletedGroup.name)) {
			setFilterGroupNames((current) => {
				const next = current.filter((n) => n !== deletedGroup.name);
				if (next.length === 0) setFilterCategory("all");
				return next;
			});
		}
		if (activeGroupId === groupId) {
			const filtered = groups.filter((g) => g.id !== groupId);
			const merged = applySystemGroupsSync(filtered, users);
			setActiveGroupId(merged[0]?.id ?? null);
		}
	}

	function addEmailsToActiveGroup() {
		if (!activeGroupId || isSystemGroup(activeGroupId)) return;
		const parsedEmails = bulkEmails
			.split(",")
			.map((v) => v.trim().toLowerCase())
			.filter(Boolean);
		if (parsedEmails.length === 0) {
			setBulkStatus("Enter one or more comma-separated emails.");
			return;
		}
		const validEmails = Array.from(new Set(parsedEmails.filter((e) => usersByEmail.has(e))));
		const skippedCount = parsedEmails.length - validEmails.length;
		if (validEmails.length === 0) {
			setBulkStatus("No matching team members found for the provided emails.");
			return;
		}
		setGroups((current) => applySystemGroupsSync(addUsersToGroup(current, validEmails, activeGroupId), users));
		setBulkEmails("");
		setBulkStatus(
			skippedCount > 0
				? `Added ${validEmails.length} users. Skipped ${skippedCount} unmatched entries.`
				: `Added ${validEmails.length} users to the group.`,
		);
	}

	const isGroupsPanelDimmed = filterCategory === "individuals" && filterIndividualEmails.length > 0;
	const isIndividualsPanelDimmed = filterCategory === "groups" && filterGroupNames.length > 0;

	// Feature 5 — repo blocklist mutations
	async function addRepo() {
		if (!newRepoUrl.trim()) return;
		setSecurityMutating(true);
		setSecurityMutateError(null);
		try {
			const patterns = newRepoPatterns
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			const response = await fetch("/api/repo-blocklists", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: newRepoUrl.trim(), patterns })
			});
			if (!response.ok) {
				const body = (await response.json()) as { error?: string };
				throw new Error(body.error || "Failed to add repo");
			}
			setNewRepoUrl("");
			setNewRepoPatterns("");
			const repos = await fetchRepoBlocklistsApi();
			setRepoBlocklists(repos);
		} catch (err) {
			setSecurityMutateError(err instanceof Error ? err.message : "Failed to add repo");
		} finally {
			setSecurityMutating(false);
		}
	}

	async function deleteRepo(repoId: string) {
		setSecurityMutating(true);
		setSecurityMutateError(null);
		try {
			const response = await fetch(`/api/repo-blocklists/${encodeURIComponent(repoId)}`, { method: "DELETE" });
			if (!response.ok) {
				const body = (await response.json()) as { error?: string };
				throw new Error(body.error || "Failed to delete repo");
			}
			const repos = await fetchRepoBlocklistsApi();
			setRepoBlocklists(repos);
		} catch (err) {
			setSecurityMutateError(err instanceof Error ? err.message : "Failed to delete repo");
		} finally {
			setSecurityMutating(false);
		}
	}

	return (
		<div className="appShell">
			<nav className="sidebar" aria-label="Main navigation">
				<div className="sidebarLogo">S</div>
				<div className="sidebarNav">
					<button
						type="button"
						className={activeTab === "analytics" ? "sidebarBtn sidebarBtnActive" : "sidebarBtn"}
						onClick={() => setActiveTab("analytics")}
						aria-label="Analytics"
						title="Analytics"
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 20 20"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.6"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<rect x="2" y="10" width="3.5" height="8" rx="1" />
							<rect x="8.25" y="6" width="3.5" height="12" rx="1" />
							<rect x="14.5" y="2" width="3.5" height="16" rx="1" />
						</svg>
					</button>
					<button
						type="button"
						className={activeTab === "users" ? "sidebarBtn sidebarBtnActive" : "sidebarBtn"}
						onClick={() => setActiveTab("users")}
						aria-label="Users"
						title="Users"
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 20 20"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.6"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<circle cx="10" cy="6" r="3.5" />
							<path d="M3 17.5c0-3.5 3.1-6 7-6s7 2.5 7 6" />
						</svg>
					</button>
					<button
						type="button"
						className={activeTab === "security" ? "sidebarBtn sidebarBtnActive" : "sidebarBtn"}
						onClick={() => setActiveTab("security")}
						aria-label="Security"
						title="Security"
					>
						<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
							<path d="M10 2L4 5v5c0 4 2.7 7.4 6 8.5 3.3-1.1 6-4.5 6-8.5V5L10 2z" />
						</svg>
					</button>
					<button
						type="button"
						className={activeTab === "definitions" ? "sidebarBtn sidebarBtnActive" : "sidebarBtn"}
						onClick={() => setActiveTab("definitions")}
						aria-label="Metric Definitions"
						title="Metric Definitions"
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 20 20"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.6"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<circle cx="10" cy="10" r="8" />
							<path d="M10 9v5" />
							<circle cx="10" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
						</svg>
					</button>
				</div>
			</nav>

			<main className="mainContent">
			<div className="pageInner">
				<section className="topbar">
					<div>
						<h1>AI SparkLine</h1>
					</div>
					{activeTab === "analytics" ? (
						<div className="controls">
							<div className="windowPicker" role="group" aria-label="Time window">
								{(presetWindows.length > 0
									? presetWindows
									: [
											{ id: "past-7d", label: "Past 7D" },
											{ id: "past-30d", label: "Past 30D" },
											{ id: "current-month", label: "Current Month" },
										]
								).map((w) => (
									<button
										key={w.id}
										type="button"
										className={windowId === w.id ? "windowChip active" : "windowChip"}
										onClick={() => setWindowId(w.id)}
									>
										{windowLabelMap.get(w.id) || w.label}
									</button>
								))}
								{monthWindows.length > 0 ? (
									<select
										aria-label="Previous month"
										className={windowId.startsWith("month-") ? "monthSelect monthSelectActive" : "monthSelect"}
										value={monthWindowId}
										onChange={(e) => setWindowId(e.target.value)}
									>
										{monthWindows.map((w) => (
											<option key={w.id} value={w.id}>
												{w.label}
											</option>
										))}
									</select>
								) : null}
							</div>
						</div>
					) : null}
				</section>

				{loading ? <p className="muted">Loading metrics...</p> : null}
				{error ? <p className="error">{error}</p> : null}

				{!loading && !error && activeTab === "analytics" ? (
					<>
						<section className="panel">
							<div className="panelHeader">
								<h2>Team Rollup</h2>
							</div>
							<div className="widgetSection">
								<div className="widgetRowFixed">
									<PlaceholderPanel title="Work Type" />
									<PlaceholderPanel title="Categories" />
								</div>
								<div className="widgetRowChangeable">
									{widgets.map((w, i) => (
										<QuartileBarChart
											key={`widget-${i}`}
											users={analyticsRows}
											metric={w.metric}
											selectedBand={w.selectedBand}
											widgetMetrics={[
												widgets[0].metric,
												widgets[1].metric,
												widgets[2].metric,
												widgets[3].metric,
											] satisfies WidgetMetricAssignment}
											widgetIndex={i as 0 | 1 | 2 | 3}
											onMetricChange={(m) =>
												setWidgets((prev) => {
													if (prev[i].metric === m) return prev;
													const next = [...prev] as [
														WidgetState,
														WidgetState,
														WidgetState,
														WidgetState,
													];
													const oldMetric = next[i].metric;
													const swapIndex = next.findIndex(
														(row, idx) => idx !== i && row.metric === m
													);
													if (swapIndex !== -1) {
														next[swapIndex] = {
															...next[swapIndex],
															metric: oldMetric,
															selectedBand: null,
														};
													}
													next[i] = { metric: m, selectedBand: null };
													return next;
												})
											}
											onBandClick={(band) =>
												setWidgets((prev) => {
													const next = [...prev] as [WidgetState, WidgetState, WidgetState, WidgetState];
													next[i] = { ...next[i], selectedBand: band };
													return next;
												})
											}
										/>
									))}
								</div>
								{effectiveRows.length === 0 && analyticsRows.length > 0 ? (
									<p className="muted" style={{ fontSize: 12, margin: "8px 0 0", textAlign: "center" }}>
										No users match the selected widget filters.
									</p>
								) : null}
							</div>
							<div className="tableWrap">
								<table>
									<thead>
										<tr>
											<th>Total AI Requests</th>
											<th>Avg Productivity</th>
											<th>Avg Agent Eff.</th>
											<th>Avg Tab Eff.</th>
											<th>Avg Adoption</th>
										</tr>
									</thead>
									<tbody>
										<tr>
											<td>{teamRollup.usageCount}</td>
											<td>{(teamRollup.productivity / rowCount).toFixed(2)}</td>
											<td>{pct(teamRollup.agentEfficiency / rowCount)}</td>
											<td>{pct(teamRollup.tabEfficiency / rowCount)}</td>
											<td>{pct(teamRollup.adoption / rowCount)}</td>
										</tr>
									</tbody>
								</table>
							</div>
						</section>

						<div className="analyticsBar">
							<div className="analyticsControls">
								<span className="controlLabel">Filter</span>
								<div className="filterAnchor" ref={filterRef}>
									<button
										type="button"
										className={hasActiveFilter ? "filterTrigger filterTriggerActive" : "filterTrigger"}
										onClick={() => {
											setIsFilterOpen((p) => !p);
											setFilterSearch("");
										}}
										aria-haspopup="dialog"
										aria-expanded={isFilterOpen}
									>
										<span className="filterTriggerLabel">{getFilterSummary()}</span>
										{hasActiveFilter ? (
											<span
												className="filterTriggerClear"
												role="button"
												tabIndex={0}
												aria-label="Clear filter"
												onClick={(e) => {
													e.stopPropagation();
													clearFilter();
												}}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														e.stopPropagation();
														clearFilter();
													}
												}}
											>
												×
											</span>
										) : (
											<span className="filterTriggerCaret" aria-hidden="true">
												▾
											</span>
										)}
									</button>

									{isFilterOpen ? (
										<div className="filterPopover" role="dialog" aria-label="Filter users">
											<div className="filterPanels">
												<div className={isGroupsPanelDimmed ? "filterPanel filterPanelDimmed" : "filterPanel"}>
													<div className="filterPanelHeader">
														<span className="filterPanelTitle">Groups</span>
														<div className="filterPanelActions">
															{groups.length > 0 ? (
																<>
																	<button
																		type="button"
																		className="filterPanelAction"
																		onClick={() => {
																			setFilterCategory("groups");
																			setFilterIndividualEmails([]);
																			setFilterGroupNames(groups.map((g) => g.name));
																		}}
																	>
																		All
																	</button>
																	{filterCategory === "groups" && filterGroupNames.length > 0 ? (
																		<button
																			type="button"
																			className="filterPanelAction"
																			onClick={() => {
																				setFilterGroupNames([]);
																				setFilterCategory("all");
																			}}
																		>
																			Clear
																		</button>
																	) : null}
																</>
															) : null}
														</div>
													</div>
													<div className="filterPanelList">
														{groups.length === 0 ? (
															<p className="filterEmptyMsg">No groups yet. Create them in the Users tab.</p>
														) : (
															groups.map((g) => (
																<label key={g.id} className="filterItem">
																	<input
																		type="checkbox"
																		checked={filterGroupNames.includes(g.name)}
																		onChange={() => toggleFilterGroup(g.name)}
																	/>
																	<span className="filterItemContent">
																		<span className="filterItemName">{g.name}</span>
																		<span className="filterItemMeta">{g.userEmails.length} members</span>
																	</span>
																</label>
															))
														)}
													</div>
													{isGroupsPanelDimmed ? (
														<div className="filterPanelOverlay">
															<span>Filtering by individuals</span>
														</div>
													) : null}
												</div>

												<div className="filterDivider" />

												<div className={isIndividualsPanelDimmed ? "filterPanel filterPanelDimmed" : "filterPanel"}>
													<div className="filterPanelHeader">
														<span className="filterPanelTitle">Individuals</span>
														<div className="filterPanelActions">
															<button
																type="button"
																className="filterPanelAction"
																onClick={() => {
																	setFilterCategory("individuals");
																	setFilterGroupNames([]);
																	setFilterIndividualEmails(filteredPopoverUsers.map((u) => u.email));
																}}
															>
																All
															</button>
															{filterCategory === "individuals" && filterIndividualEmails.length > 0 ? (
																<button
																	type="button"
																	className="filterPanelAction"
																	onClick={() => {
																		setFilterIndividualEmails([]);
																		setFilterCategory("all");
																	}}
																>
																	Clear
																</button>
															) : null}
														</div>
													</div>
													<div className="filterPanelSearch">
														<input
															ref={filterSearchRef}
															type="text"
															value={filterSearch}
															onChange={(e) => setFilterSearch(e.target.value)}
															placeholder="Search name or email..."
															className="filterSearchInput"
														/>
													</div>
													<div className="filterPanelList filterPanelListTall">
														{filteredPopoverUsers.length === 0 ? (
															<p className="filterEmptyMsg">No matches</p>
														) : (
															filteredPopoverUsers.map((u) => (
																<label key={u.email} className="filterItem">
																	<input
																		type="checkbox"
																		checked={filterIndividualEmails.includes(u.email)}
																		onChange={() => toggleFilterIndividual(u.email)}
																	/>
																	<span className="filterItemContent">
																		<span className="filterItemName">{u.name}</span>
																		<span className="filterItemMeta">{u.email}</span>
																	</span>
																</label>
															))
														)}
													</div>
													{isIndividualsPanelDimmed ? (
														<div className="filterPanelOverlay">
															<span>Filtering by groups</span>
														</div>
													) : null}
												</div>
											</div>

											<div className="filterPopoverFooter">
												<span className="muted tiny">{analyticsUserCount} users match</span>
											</div>
										</div>
									) : null}
								</div>
							</div>
							<span className="muted tiny">
								{data?.selectedWindow ? (
									<>{data.selectedWindow.label} ({formatDateRange(data.selectedWindow.startDate, data.selectedWindow.endDate)}) · </>
								) : null}
								{analyticsUserCount} users in view
								{data?.generatedAt ? (
									<>
										{" "}
										· last updated{" "}
										{new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
									</>
								) : null}
							</span>
						</div>

						{hasActiveFilter ? (
							<div className="filterChips">
								{filterCategory === "groups"
									? filterGroupNames.map((name) => (
											<span key={name} className="filterChip filterChipGroup">
												<span className="filterChipText">{name}</span>
												<button
													type="button"
													className="filterChipRemove"
													onClick={() => removeFilterChip("group", name)}
													aria-label={`Remove ${name}`}
												>
													×
												</button>
											</span>
										))
									: null}
								{filterCategory === "individuals"
									? filterIndividualEmails.map((email) => {
											const match = users.find((u) => u.email === email);
											return (
												<span key={email} className="filterChip filterChipIndividual">
													<span className="filterChipText">{match?.name || email}</span>
													<button
														type="button"
														className="filterChipRemove"
														onClick={() => removeFilterChip("individual", email)}
														aria-label={`Remove ${email}`}
													>
														×
													</button>
												</span>
											);
										})
									: null}
								<button type="button" className="filterChipsClear" onClick={clearFilter}>
									Clear All
								</button>
							</div>
						) : null}

						<div className="tableWrap">
							<table>
								<thead>
									<tr>
										<th>User</th>
										<th>Favorite Model</th>
										<th>Trend</th>
										<th>Usage</th>
										<th>Productivity</th>
										<th>Agent Eff.</th>
										<th>Tab Eff.</th>
										<th>Adoption</th>
									</tr>
								</thead>
								<tbody>
									{effectiveRows.length === 0 ? (
										<tr>
											<td colSpan={8} className="muted">
												No data for the current filter.
											</td>
										</tr>
									) : (
										effectiveRows.map((row) => (
											<tr
												key={`${row.windowId}-${row.userEmail}`}
												className={`tableRowClickable${drillDownEmail === row.userEmail ? " tableRowActive" : ""}`}
												onClick={() => {
													setDrillDownEvents([]);
													setDrillDownTotal(0);
													setDrillDownTotalPages(1);
													setDrillDownError(null);
													setDrillDownEmail(row.userEmail);
													setDrillDownPage(1);
												}}
											>
												<td>
													<div className="userCell">
														<span>{resolveUserName(row.userName, row.userEmail)}</span>
														<span className="muted tiny">{row.userEmail}</span>
													</div>
												</td>
												<td>{row.favoriteModel}</td>
												<td><Sparkline points={row.dailyTrend} /></td>
												<td>{row.usageCount}</td>
												<td>{row.productivityScore}</td>
												<td>{pct(row.agentEfficiency)}</td>
												<td>{pct(row.tabEfficiency)}</td>
												<td>{pct(row.adoptionRate)}</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
					</>
				) : null}

				{!loading && !error && activeTab === "users" ? (
					<section className="usersLayout">
						<aside className="cardPanel">
							<div className="panelHeader">
								<h2>Groups</h2>
								<button type="button" className="plainButton plainButtonSm" onClick={addGroup}>
									New Group
								</button>
							</div>
							<div className="groupList">
								{groups.length === 0 ? <p className="muted">No groups yet.</p> : null}
								{groups.map((group) => (
									<div key={group.id} className={activeGroupId === group.id ? "groupItem active" : "groupItem"}>
										<button type="button" className="groupItemSelect" onClick={() => setActiveGroupId(group.id)}>
											<span className="groupItemMain">
												<span className="groupItemTitle">{group.name}</span>
												<span className="groupItemMeta">{group.userEmails.length} users</span>
											</span>
											<span className="groupItemMarker" aria-hidden="true">
												{activeGroupId === group.id ? "selected" : "open"}
											</span>
										</button>
										{!isSystemGroup(group.id) ? (
											<button
												type="button"
												className="groupDeleteButton"
												onClick={() => deleteGroup(group.id)}
												aria-label={`Delete ${group.name}`}
											>
												Delete
											</button>
										) : null}
									</div>
								))}
							</div>
							{activeGroup && !isSystemGroup(activeGroup.id) ? (
								<div className="groupEditor">
									<div className="groupEditorHeader">
										<span className="groupEditorTitle">Configure</span>
									</div>
									<label htmlFor="groupName" className="groupEditorLabel">
										Group Name
									</label>
									<input id="groupName" value={activeGroup.name} onChange={(e) => renameActiveGroup(e.target.value)} />
									<label htmlFor="groupBulkEmails" className="groupEditorLabel bulkLabel">
										Add Users By Email
									</label>
									<textarea
										id="groupBulkEmails"
										value={bulkEmails}
										onChange={(e) => setBulkEmails(e.target.value)}
										placeholder="name1@company.com, name2@company.com"
										rows={4}
									/>
									<div className="groupEditorActions">
										<button type="button" className="plainButton plainButtonSm" onClick={addEmailsToActiveGroup}>
											Add
										</button>
									</div>
									{bulkStatus ? <p className="groupStatus">{bulkStatus}</p> : null}
								</div>
							) : activeGroup && isSystemGroup(activeGroup.id) ? (
								<div className="groupEditor">
									<div className="groupEditorHeader">
										<span className="groupEditorTitle">{activeGroup.name}</span>
									</div>
									<p className="muted tiny">This group is managed automatically and cannot be edited.</p>
								</div>
							) : null}
						</aside>

						<section className="cardPanel">
							<div className="panelHeader">
								<h2>Team Members</h2>
								<span className="muted tiny">{users.length} users</span>
							</div>
							<div className="tableWrap">
								<table>
									<thead>
										<tr>
											<th>User</th>
											<th>Role</th>
											<th>Group</th>
										</tr>
									</thead>
									<tbody>
										{users.map((user) => {
											const assignedGroup = groups.find((g) => g.userEmails.includes(user.email));
											const customAssignedGroup = assignedGroup && !isSystemGroup(assignedGroup.id) ? assignedGroup : null;
											return (
												<tr key={user.email}>
													<td>
														<div className="userCell">
															<span>{user.name}</span>
															<span className="muted tiny">{user.email}</span>
														</div>
													</td>
													<td>{user.role}</td>
													<td>
														<select
															value={customAssignedGroup?.id || ""}
															disabled={user.isRemoved}
															onChange={(e) => {
																if (e.target.value) assignUserToGroup(user.email, e.target.value);
																else clearUserGroup(user.email);
															}}
														>
															<option value="">No Group</option>
															{groups.filter((g) => !isSystemGroup(g.id)).map((g) => (
																<option key={g.id} value={g.id}>
																	{g.name}
																</option>
															))}
														</select>
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						</section>
					</section>
				) : null}

				{!loading && !error && activeTab === "definitions" ? (
					<section className="defsPage">
						<div className="defsPageHeader">
							<h2>Metric Definitions</h2>
							<p className="muted">What each number on the Analytics tab means, where it comes from, and how to read it.</p>
						</div>
						<div className="defsGrid">
							{definitions.map((def, i) => (
								<div key={def.name} className="defCard">
									<div className="defCardLeft">
										<span className="defCardNum">0{i + 1}</span>
										<h3 className="defCardTitle">{def.name}</h3>
										<p className="defCardTagline">{def.tagline}</p>
									</div>
									<div className="defCardRight">
										<div className="defCardRow">
											<span className="defCardLabel">Formula</span>
											<span className="defCardFormula">{def.formula}</span>
										</div>
										<div className="defCardRow">
											<span className="defCardLabel">Source</span>
											<span className="defCardValue">{def.source}</span>
										</div>
										<div className="defCardRow">
											<span className="defCardLabel">How to read</span>
											<span className="defCardValue">{def.interpret}</span>
										</div>
									</div>
								</div>
							))}
						</div>
					</section>
				) : null}

				{activeTab === "audit" ? (
					<section className="panel">
						<div className="panelHeader">
							<h2>Audit Log</h2>
						</div>
						<div className="auditPage">
							<div className="auditControls">
								<input
									className="auditSearchInput"
									type="text"
									placeholder="Search by user or event…"
									value={auditSearchInput}
									onChange={(e) => { setAuditSearchInput(e.target.value); setAuditPage(1); }}
								/>
								<input
									className="auditSearchInput"
									type="text"
									placeholder="Event types (comma-separated)"
									value={auditEventTypes}
									onChange={(e) => { setAuditEventTypes(e.target.value); setAuditPage(1); }}
								/>
							</div>
							{auditLoading ? (
								<p className="muted">Loading audit logs…</p>
							) : auditError ? (
								<p className="error">{auditError}</p>
							) : (
								<>
									<div className="tableWrap">
										<table>
											<thead>
												<tr>
													<th>Timestamp</th>
													<th>User</th>
													<th>Event Type</th>
													<th>Details</th>
												</tr>
											</thead>
											<tbody>
												{auditLogs.length === 0 ? (
													<tr>
														<td colSpan={4} className="muted">No audit events found.</td>
													</tr>
												) : (
													auditLogs.map((entry, i) => (
														<tr key={i}>
															<td>{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "—"}</td>
															<td>{entry.userEmail || "—"}</td>
															<td>{entry.eventType || "—"}</td>
															<td className="auditDetails">{entry.details ? JSON.stringify(entry.details).slice(0, 80) : "—"}</td>
														</tr>
													))
												)}
											</tbody>
										</table>
									</div>
									<div className="auditFooter">
										<span className="muted tiny">Total: {auditTotal} events</span>
										<div className="paginationControls">
											<button
												type="button"
												className="plainButton plainButtonSm"
												disabled={auditPage <= 1}
												onClick={() => setAuditPage((p) => p - 1)}
											>
												← Prev
											</button>
											<span className="muted tiny">Page {auditPage} / {auditTotalPages}</span>
											<button
												type="button"
												className="plainButton plainButtonSm"
												disabled={auditPage >= auditTotalPages}
												onClick={() => setAuditPage((p) => p + 1)}
											>
												Next →
											</button>
										</div>
									</div>
								</>
							)}
						</div>
					</section>
				) : null}

				{activeTab === "security" ? (
					<section className="panel">
						<div className="panelHeader">
							<h2>Repo Blocklist</h2>
						</div>
						<div className="securityPage">
							<p className="muted">Repositories blocked from Cursor AI features. Add a URL and optional file-path patterns.</p>
							{securityMutateError ? <p className="error">{securityMutateError}</p> : null}
							<div className="securityAddRow">
								<input
									className="auditSearchInput"
									type="text"
									placeholder="Repository URL (e.g. github.com/org/repo)"
									value={newRepoUrl}
									onChange={(e) => setNewRepoUrl(e.target.value)}
								/>
								<input
									className="auditSearchInput"
									type="text"
									placeholder="Patterns, comma-separated (optional)"
									value={newRepoPatterns}
									onChange={(e) => setNewRepoPatterns(e.target.value)}
								/>
								<button
									type="button"
									className="plainButton plainButtonSm"
									disabled={securityMutating || !newRepoUrl.trim()}
									onClick={addRepo}
								>
									{securityMutating ? "Adding…" : "Add"}
								</button>
							</div>
							{securityLoading ? (
								<p className="muted">Loading…</p>
							) : securityError ? (
								<p className="error">{securityError}</p>
							) : (
								<div className="tableWrap">
									<table>
										<thead>
											<tr>
												<th>Repository URL</th>
												<th>Patterns</th>
												<th></th>
											</tr>
										</thead>
										<tbody>
											{repoBlocklists.length === 0 ? (
												<tr>
													<td colSpan={3} className="muted">No repos blocked.</td>
												</tr>
											) : (
												repoBlocklists.map((repo) => (
													<tr key={repo.id}>
														<td>{repo.url}</td>
														<td>
															<span className="patternsList">
																{repo.patterns.length > 0 ? repo.patterns.join(", ") : <span className="muted">—</span>}
															</span>
														</td>
														<td>
															<button
																type="button"
																className="plainButton plainButtonSm deleteButton"
																disabled={securityMutating}
																onClick={() => deleteRepo(repo.id)}
															>
																Delete
															</button>
														</td>
													</tr>
												))
											)}
										</tbody>
									</table>
								</div>
							)}
						</div>
					</section>
				) : null}

				{drillDownEmail !== null ? (
					<div
						className="drillDownOverlay"
						onClick={() => setDrillDownEmail(null)}
					>
						<aside className="drillDownPanel" onClick={(e) => e.stopPropagation()}>
							<div className="drillDownHeader">
								<div>
									<strong>Usage Events</strong>
									<p className="muted tiny">{drillDownEmail}</p>
									{data?.selectedWindow ? (
										<p className="muted tiny">
											{data.selectedWindow.label} (
											{formatDateRange(
												data.selectedWindow.startDate,
												data.selectedWindow.endDate
											)}
											)
										</p>
									) : null}
								</div>
								<button
									type="button"
									className="plainButton plainButtonSm drillDownClose"
									aria-label="Close"
									onClick={() => setDrillDownEmail(null)}
								>
									×
								</button>
							</div>
							{drillDownLoading ? (
								<p className="muted" style={{ padding: "16px" }}>Loading…</p>
							) : drillDownError ? (
								<p className="error" style={{ padding: "16px" }}>{drillDownError}</p>
							) : (
								<div className="tableWrap" style={{ flex: 1 }}>
									<table>
										<thead>
											<tr>
												<th>Timestamp</th>
												<th>Model</th>
												<th>Kind</th>
												<th>Max Mode</th>
												<th>Charged (¢)</th>
											</tr>
										</thead>
										<tbody>
											{drillDownEvents.length === 0 ? (
												<tr>
													<td colSpan={5} className="muted">No events found.</td>
												</tr>
											) : (
												drillDownEvents.map((evt, i) => (
													<tr key={i}>
														<td>{evt.timestamp ? new Date(Number(evt.timestamp)).toLocaleString() : "—"}</td>
														<td>{evt.model || "—"}</td>
														<td>{evt.kind || "—"}</td>
														<td>{evt.maxMode ? "Yes" : "No"}</td>
														<td>{evt.chargedCents ?? "—"}</td>
													</tr>
												))
											)}
										</tbody>
									</table>
								</div>
							)}
							{!drillDownLoading && !drillDownError ? (
								<div className="drillDownFooter">
									<span className="muted tiny">Total: {drillDownTotal} events</span>
									<div className="paginationControls">
										<button
											type="button"
											className="plainButton plainButtonSm"
											disabled={drillDownPage <= 1}
											onClick={() => setDrillDownPage((p) => p - 1)}
										>
											← Prev
										</button>
										<span className="muted tiny">
											Page {drillDownPage} / {drillDownTotalPages}
										</span>
										<button
											type="button"
											className="plainButton plainButtonSm"
											disabled={drillDownPage >= drillDownTotalPages}
											onClick={() => setDrillDownPage((p) => p + 1)}
										>
											Next →
										</button>
									</div>
								</div>
							) : null}
						</aside>
					</div>
				) : null}
			</div>
			</main>
		</div>
	);
}

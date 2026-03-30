"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { UserWindowMetricRow as MetricRow } from "@/lib/metrics";

interface ApiResponse {
	generatedAt: string;
	rows: MetricRow[];
	definitions: Record<string, string>;
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

export function Dashboard() {
	const [windowId, setWindowId] = useState("past-7d");
	const [activeTab, setActiveTab] = useState<"analytics" | "users" | "definitions">("analytics");
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

	const rows = useMemo(() => data?.rows ?? [], [data]);
	const definitions = useMemo(() => data?.definitions ?? {}, [data]);
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

	const groupByUserEmail = useMemo(() => {
		const lookup = new Map<string, string>();
		for (const group of groups) {
			for (const email of group.userEmails) lookup.set(email, group.name);
		}
		return lookup;
	}, [groups]);

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

	const analyticsUserCount = analyticsRows.length;
	const isShowingAll = !hasActiveFilter;

	const teamRollup = useMemo(() => {
		return analyticsRows.reduce(
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
	}, [analyticsRows]);

	const rowCount = Math.max(analyticsRows.length, 1);
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
				<section className="topbar">
					<div>
						<h1>AI SparkLine</h1>
						<p className="meta inlineMeta">
							{activeTab === "users" ? (
								<>
									Total Users: {users.length}
									{data?.cached ? <span className="muted tiny"> (cached)</span> : null}
								</>
							) : (
								<>
									{data?.selectedWindow ? (
										<>
											{data.selectedWindow.label}{" "}
											<span className="muted">
												({formatDateRange(data.selectedWindow.startDate, data.selectedWindow.endDate)})
											</span>
										</>
									) : (
										"–"
									)}{" "}
									| Total Users: {users.length}
									{activeTab === "analytics" && !isShowingAll ? <> | In View: {analyticsUserCount}</> : null}
									{data?.cached ? <span className="muted tiny"> (cached)</span> : null}
								</>
							)}
						</p>
					</div>
					{activeTab !== "users" ? (
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
										<th>Group</th>
										<th>Favorite Model</th>
										<th>Usage</th>
										<th>Productivity</th>
										<th>Agent Eff.</th>
										<th>Tab Eff.</th>
										<th>Adoption</th>
									</tr>
								</thead>
								<tbody>
									{analyticsRows.length === 0 ? (
										<tr>
											<td colSpan={8} className="muted">
												No data for the current filter.
											</td>
										</tr>
									) : (
										analyticsRows.map((row) => (
											<tr key={`${row.windowId}-${row.userEmail}`}>
												<td>
													<div className="userCell">
														<span>{resolveUserName(row.userName, row.userEmail)}</span>
														<span className="muted tiny">{row.userEmail}</span>
													</div>
												</td>
												<td>{groupByUserEmail.get(row.userEmail) || "-"}</td>
												<td>{row.favoriteModel}</td>
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
						<h2>Metric Definitions</h2>
						<p className="muted">How each metric on the Analytics dashboard is calculated.</p>
						<div className="defsGrid">
							{Object.entries(definitions).map(([key, value]) => (
								<div key={key} className="defCard">
									<h3 className="defCardTitle">{key}</h3>
									<p className="defCardBody">{value}</p>
								</div>
							))}
						</div>
					</section>
				) : null}
			</main>
		</div>
	);
}

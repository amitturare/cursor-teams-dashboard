"use client";

import { useEffect, useMemo, useState } from "react";

interface MetricRow {
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

interface ApiResponse {
  generatedAt: string;
  rows: MetricRow[];
  definitions: Record<string, string>;
  cached?: boolean;
  selectedWindow: { id: string; label: string };
  availableWindows: Array<{ id: string; label: string }>;
}

interface UserRecord {
  email: string;
  name: string;
  role: string;
}

interface UserGroup {
  id: string;
  name: string;
  userEmails: string[];
}

const responseCache = new Map<string, ApiResponse>();
const inflightRequests = new Map<string, Promise<ApiResponse>>();
const SELECTIONS_KEY = "cursor-dashboard-selected-users";
const GROUPS_KEY = "cursor-dashboard-user-groups";

function pct(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

function createGroupId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `group-${Date.now()}`;
}

async function loadMetrics(windowId: string): Promise<ApiResponse> {
  const cached = responseCache.get(windowId);
  if (cached) {
    return cached;
  }

  const existingRequest = inflightRequests.get(windowId);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetch(`/api/team-metrics?window=${windowId}`, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error || `Request failed with ${response.status}`);
      }

      const body = (await response.json()) as ApiResponse;
      responseCache.set(windowId, body);
      return body;
    })
    .finally(() => {
      inflightRequests.delete(windowId);
    });

  inflightRequests.set(windowId, request);
  return request;
}

function sanitizeGroups(groups: UserGroup[], validEmails: Set<string>) {
  return groups
    .map((group) => ({
      ...group,
      userEmails: group.userEmails.filter((email) => validEmails.has(email))
    }))
    .filter((group) => group.name.trim().length > 0);
}

export function Dashboard() {
  const [windowId, setWindowId] = useState("past-7d");
  const [activeTab, setActiveTab] = useState<"analytics" | "users">("analytics");
  const [analyticsGroupFilter, setAnalyticsGroupFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [bulkEmails, setBulkEmails] = useState("");
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);
  const [preferencesReady, setPreferencesReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const body = await loadMetrics(windowId);
        if (!cancelled) {
          setData(body);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unexpected error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
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
        ["current-month", "Current Month"]
      ]),
    []
  );
  const presetWindows = useMemo(
    () => windows.filter((window) => ["past-7d", "past-30d", "current-month"].includes(window.id)),
    [windows]
  );
  const monthWindows = useMemo(
    () => windows.filter((window) => window.id.startsWith("month-")),
    [windows]
  );
  const monthWindowId = windowId.startsWith("month-") ? windowId : monthWindows[0]?.id ?? "";

  const users = useMemo<UserRecord[]>(() => {
    const map = new Map<string, UserRecord>();

    for (const row of rows) {
      if (!map.has(row.userEmail)) {
        map.set(row.userEmail, {
          email: row.userEmail,
          name: row.userName,
          role: row.role
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);
  const usersByEmail = useMemo(() => new Map(users.map((user) => [user.email.toLowerCase(), user])), [users]);

  useEffect(() => {
    if (users.length === 0) {
      return;
    }

    const validEmails = new Set(users.map((user) => user.email));

    if (!preferencesReady) {
      let nextSelections = users.map((user) => user.email);
      let nextGroups: UserGroup[] = [];

      try {
        const rawSelections = window.localStorage.getItem(SELECTIONS_KEY);
        const rawGroups = window.localStorage.getItem(GROUPS_KEY);

        if (rawSelections) {
          const parsedSelections = JSON.parse(rawSelections) as string[];
          nextSelections = parsedSelections.filter((email) => validEmails.has(email));
        }

        if (rawGroups) {
          nextGroups = sanitizeGroups(JSON.parse(rawGroups) as UserGroup[], validEmails);
        }
      } catch {
        nextSelections = users.map((user) => user.email);
        nextGroups = [];
      }

      if (nextSelections.length === 0) {
        nextSelections = users.map((user) => user.email);
      }

      setSelectedEmails(nextSelections);
      setGroups(nextGroups);
      setActiveGroupId(nextGroups[0]?.id ?? null);
      setPreferencesReady(true);
      return;
    }

    setSelectedEmails((current) => {
      const next = current.filter((email) => validEmails.has(email));
      return next.length > 0 ? next : users.map((user) => user.email);
    });
    setGroups((current) => sanitizeGroups(current, validEmails));
  }, [users, preferencesReady]);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    window.localStorage.setItem(SELECTIONS_KEY, JSON.stringify(selectedEmails));
    window.localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  }, [selectedEmails, groups, preferencesReady]);

  useEffect(() => {
    if (!activeGroupId) {
      return;
    }

    if (!groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(groups[0]?.id ?? null);
    }
  }, [groups, activeGroupId]);

  const selectedSet = useMemo(() => new Set(selectedEmails), [selectedEmails]);
  const selectedRows = useMemo(() => rows.filter((row) => selectedSet.has(row.userEmail)), [rows, selectedSet]);

  const groupByUserEmail = useMemo(() => {
    const lookup = new Map<string, string>();

    for (const group of groups) {
      for (const email of group.userEmails) {
        lookup.set(email, group.name);
      }
    }

    return lookup;
  }, [groups]);

  const analyticsRows = useMemo(() => {
    if (analyticsGroupFilter === "all") {
      return selectedRows;
    }

    if (analyticsGroupFilter === "ungrouped") {
      return selectedRows.filter((row) => !groupByUserEmail.has(row.userEmail));
    }

    return selectedRows.filter((row) => groupByUserEmail.get(row.userEmail) === analyticsGroupFilter);
  }, [selectedRows, analyticsGroupFilter, groupByUserEmail]);
  const analyticsUserCount = analyticsRows.length;
  const headerSelectedCount = activeTab === "analytics" ? analyticsUserCount : selectedEmails.length;
  const selectedLabel =
    activeTab === "analytics" && analyticsGroupFilter !== "all" ? "Selected In View" : "Selected";

  const teamRollup = useMemo(() => {
    return analyticsRows.reduce(
      (acc, row) => {
        acc.usageCount += row.usageCount;
        acc.aiRequests += row.totalAiRequests;
        acc.productivity += row.productivityScore;
        acc.agentEfficiency += row.agentEfficiency;
        acc.tabEfficiency += row.tabEfficiency;
        acc.adoption += row.adoptionRate;
        return acc;
      },
      {
        usageCount: 0,
        aiRequests: 0,
        productivity: 0,
        agentEfficiency: 0,
        tabEfficiency: 0,
        adoption: 0
      }
    );
  }, [analyticsRows]);

  const rowCount = Math.max(analyticsRows.length, 1);
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null;

  function toggleUser(email: string) {
    setSelectedEmails((current) =>
      current.includes(email) ? current.filter((item) => item !== email) : [...current, email]
    );
  }

  function assignUserToGroup(email: string, groupId: string) {
    setGroups((current) =>
      current.map((group) => {
        const withoutUser = group.userEmails.filter((item) => item !== email);
        if (group.id !== groupId) {
          return { ...group, userEmails: withoutUser };
        }
        return { ...group, userEmails: [...withoutUser, email].sort() };
      })
    );
  }

  function clearUserGroup(email: string) {
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        userEmails: group.userEmails.filter((item) => item !== email)
      }))
    );
  }

  function addGroup() {
    const nextGroup: UserGroup = {
      id: createGroupId(),
      name: `Group ${groups.length + 1}`,
      userEmails: []
    };

    setGroups((current) => [...current, nextGroup]);
    setActiveGroupId(nextGroup.id);
  }

  function renameActiveGroup(name: string) {
    if (!activeGroupId) {
      return;
    }

    setGroups((current) =>
      current.map((group) => (group.id === activeGroupId ? { ...group, name } : group))
    );
  }

  function deleteGroup(groupId: string) {
    setGroups((current) => current.filter((group) => group.id !== groupId));
    setBulkStatus(null);
    setBulkEmails("");
    setAnalyticsGroupFilter((current) => {
      const deletedGroup = groups.find((group) => group.id === groupId);
      if (deletedGroup && current === deletedGroup.name) {
        return "all";
      }
      return current;
    });
    if (activeGroupId === groupId) {
      const remainingGroups = groups.filter((group) => group.id !== groupId);
      setActiveGroupId(remainingGroups[0]?.id ?? null);
    }
  }

  function addEmailsToActiveGroup() {
    if (!activeGroupId) {
      return;
    }

    const parsedEmails = bulkEmails
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    if (parsedEmails.length === 0) {
      setBulkStatus("Enter one or more comma-separated emails.");
      return;
    }

    const validEmails = Array.from(new Set(parsedEmails.filter((email) => usersByEmail.has(email))));
    const skippedCount = parsedEmails.length - validEmails.length;

    if (validEmails.length === 0) {
      setBulkStatus("No matching team members found for the provided emails.");
      return;
    }

    setGroups((current) =>
      current.map((group) => {
        const withoutMovedUsers = group.userEmails.filter((email) => !validEmails.includes(email));
        if (group.id !== activeGroupId) {
          return { ...group, userEmails: withoutMovedUsers };
        }
        return { ...group, userEmails: Array.from(new Set([...withoutMovedUsers, ...validEmails])).sort() };
      })
    );
    setSelectedEmails((current) => Array.from(new Set([...current, ...validEmails])).sort());
    setBulkEmails("");
    setBulkStatus(
      skippedCount > 0
        ? `Added ${validEmails.length} users. Skipped ${skippedCount} unmatched entries.`
        : `Added ${validEmails.length} users to the group.`
    );
  }

  return (
    <main className="wrap">
      <section className="topbar">
        <div>
          <h1>Cursor Team Usage</h1>
          <p className="meta inlineMeta">
            Window: {data?.selectedWindow.label || "-"} | Total Users: {users.length} | {selectedLabel}: {headerSelectedCount}
            {data?.cached ? <span className="muted tiny"> (cached)</span> : null}
          </p>
        </div>
        <div className="controls">
          <span className="controlLabel">Window</span>
          <div className="windowPicker" role="group" aria-label="Time window">
            {(presetWindows.length > 0
              ? presetWindows
              : [
                  { id: "past-7d", label: "Past 7D" },
                  { id: "past-30d", label: "Past 30D" },
                  { id: "current-month", label: "Current Month" }
                ]
            ).map((window) => (
              <button
                key={window.id}
                type="button"
                className={windowId === window.id ? "windowChip active" : "windowChip"}
                onClick={() => setWindowId(window.id)}
              >
                {windowLabelMap.get(window.id) || window.label}
              </button>
            ))}
          </div>
          {monthWindows.length > 0 ? (
            <select
              aria-label="Previous month"
              className="monthSelect"
              value={monthWindowId}
              onChange={(event) => setWindowId(event.target.value)}
            >
              {monthWindows.map((window) => (
                <option key={window.id} value={window.id}>
                  {window.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </section>

      <section className="tabRow" role="tablist" aria-label="Dashboard sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "analytics"}
          className={activeTab === "analytics" ? "tabButton active" : "tabButton"}
          onClick={() => setActiveTab("analytics")}
        >
          Analytics
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "users"}
          className={activeTab === "users" ? "tabButton active" : "tabButton"}
          onClick={() => setActiveTab("users")}
        >
          Users
        </button>
      </section>

      {loading ? <p className="muted">Loading metrics...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && !error && activeTab === "analytics" ? (
        <>
          <div className="analyticsBar">
            <p className="meta">
              Generated: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : "-"} | Groups: {groups.length}
            </p>
            <div className="analyticsControls">
              <span className="controlLabel">Group Filter</span>
              <select
                className="groupFilterSelect"
                value={analyticsGroupFilter}
                onChange={(event) => setAnalyticsGroupFilter(event.target.value)}
              >
                <option value="all">All Selected Users</option>
                <option value="ungrouped">Ungrouped Only</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.name}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <section className="panel">
            <div className="panelHeader">
              <h2>Team Rollup</h2>
              <span className="muted tiny">{analyticsUserCount} users in view</span>
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Total Usage</th>
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
                    <td>{teamRollup.aiRequests}</td>
                    <td>{(teamRollup.productivity / rowCount).toFixed(2)}</td>
                    <td>{pct(teamRollup.agentEfficiency / rowCount)}</td>
                    <td>{pct(teamRollup.tabEfficiency / rowCount)}</td>
                    <td>{pct(teamRollup.adoption / rowCount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

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
                      No analytics rows for this group filter.
                    </td>
                  </tr>
                ) : (
                  analyticsRows.map((row) => (
                    <tr key={`${row.windowId}-${row.userEmail}`}>
                      <td>
                        <div className="userCell">
                          <span>{row.userName}</span>
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

          <details className="panel help">
            <summary>Metric Definitions</summary>
            <div className="defs">
              {Object.entries(definitions).map(([key, value]) => (
                <p key={key}>
                  <span className="defKey">{key}</span>: {value}
                </p>
              ))}
            </div>
          </details>
        </>
      ) : null}

      {!loading && !error && activeTab === "users" ? (
        <section className="usersLayout">
          <aside className="cardPanel">
            <div className="panelHeader">
              <h2>Groups</h2>
              <button type="button" className="plainButton" onClick={addGroup}>
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
                  <button
                    type="button"
                    className="groupDeleteButton"
                    onClick={() => deleteGroup(group.id)}
                    aria-label={`Delete ${group.name}`}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>

            {activeGroup ? (
              <div className="groupEditor">
                <div className="groupEditorHeader">
                  <span className="groupEditorTitle">Group Settings</span>
                  <span className="muted tiny">Renames this collection everywhere</span>
                </div>
                <label htmlFor="groupName" className="groupEditorLabel">
                  Group Name
                </label>
                <input
                  id="groupName"
                  value={activeGroup.name}
                  onChange={(event) => renameActiveGroup(event.target.value)}
                />
                <label htmlFor="groupBulkEmails" className="groupEditorLabel bulkLabel">
                  Add Users By Email
                </label>
                <textarea
                  id="groupBulkEmails"
                  value={bulkEmails}
                  onChange={(event) => setBulkEmails(event.target.value)}
                  placeholder="name1@company.com, name2@company.com"
                  rows={4}
                />
                <div className="groupEditorActions">
                  <button type="button" className="plainButton" onClick={addEmailsToActiveGroup}>
                    Add Emails
                  </button>
                </div>
                <p className="groupHelperText">Comma-separated emails. Matching users will be selected and grouped.</p>
                {bulkStatus ? <p className="groupStatus">{bulkStatus}</p> : null}
              </div>
            ) : null}
          </aside>

          <section className="cardPanel">
            <div className="panelHeader">
              <h2>Users</h2>
              <div className="buttonRow">
                <button
                  type="button"
                  className="plainButton"
                  onClick={() => setSelectedEmails(users.map((user) => user.email))}
                >
                  Select All
                </button>
                <button type="button" className="plainButton" onClick={() => setSelectedEmails([])}>
                  Clear
                </button>
              </div>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Include</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Group</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const assignedGroup = groups.find((group) => group.userEmails.includes(user.email));
                    return (
                      <tr key={user.email}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedSet.has(user.email)}
                            onChange={() => toggleUser(user.email)}
                          />
                        </td>
                        <td>
                          <div className="userCell">
                            <span>{user.name}</span>
                            <span className="muted tiny">{user.email}</span>
                          </div>
                        </td>
                        <td>{user.role}</td>
                        <td>
                          <select
                            value={assignedGroup?.id || ""}
                            onChange={(event) => {
                              if (event.target.value) {
                                assignUserToGroup(user.email, event.target.value);
                              } else {
                                clearUserGroup(user.email);
                              }
                            }}
                          >
                            <option value="">No Group</option>
                            {groups.map((group) => (
                              <option key={group.id} value={group.id}>
                                {group.name}
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
    </main>
  );
}

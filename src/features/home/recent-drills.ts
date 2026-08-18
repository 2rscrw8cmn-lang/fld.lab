import type { SessionSummary } from "@/lib/history-api";

export type RecentDrill = {
  id: string;
  name: string;
  category: string;
  lastUsedAt: string;
};

export function recentDrillsFromSessions(sessions: SessionSummary[], limit = 3): RecentDrill[] {
  const seen = new Set<string>();
  const recent: RecentDrill[] = [];

  const newestFirst = [...sessions]
    .filter((session) => session.status !== "active")
    .sort((a, b) => b.started_at.localeCompare(a.started_at));

  for (const session of newestFirst) {
    if (seen.has(session.drill_id)) continue;
    seen.add(session.drill_id);
    recent.push({
      id: session.drill_id,
      name: session.drill_name,
      category: session.drill_category,
      lastUsedAt: session.started_at,
    });
    if (recent.length >= limit) break;
  }

  return recent;
}

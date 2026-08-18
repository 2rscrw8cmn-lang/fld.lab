import type { MeasurementType } from "@/lib/api";

export type ResultMetric = {
  type: MeasurementType;
  key: string;
  label: string;
  unit: string | null;
  direction: "lower" | "higher" | "none";
  aggregation: "best" | "average" | "latest" | "total";
  total_attempts: number | null;
  max: number | null;
};

export type DerivedSessionResult = {
  session_id: string;
  team_id: string;
  drill_id: string;
  drill_version_id: string;
  athlete_id: string;
  started_at: string;
  completed_at: string | null;
  session_status: "active" | "completed" | "abandoned";
  value: number;
  attempt_count: number;
  metric: ResultMetric;
};

export type ResultSummary = {
  pb: number | null;
  latest: number | null;
  previous: number | null;
  change_from_previous: number | null;
  improved_from_previous: boolean | null;
  result_count: number;
};

export type AthleteResultGroup = {
  drill: { id: string; name: string; category: string };
  metric: ResultMetric | null;
  summary: ResultSummary;
  results: DerivedSessionResult[];
};

export type AthleteResults = {
  athlete: { id: string; first_name: string; last_name: string };
  groups: AthleteResultGroup[];
};

export type LeaderboardEntry = {
  rank: number | null;
  athlete: { id: string; first_name: string; last_name: string };
  membership: {
    jersey_number: string | null;
    primary_position: string | null;
    secondary_position: string | null;
  };
  pb: number | null;
  latest: number | null;
  previous: number | null;
  result_count: number;
};

export type DrillLeaderboard = {
  drill: { id: string; name: string; category: string };
  metric: ResultMetric | null;
  entries: LeaderboardEntry[];
};

async function read<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    let message = "Could not load results.";
    try {
      const body = await response.json() as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      // Keep generic message for non-JSON failures.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function getAthleteResults(
  athleteId: string,
  filters: { teamId?: string; drillId?: string; from?: string; to?: string } = {},
): Promise<AthleteResults> {
  const params = new URLSearchParams();
  if (filters.teamId) params.set("team_id", filters.teamId);
  if (filters.drillId) params.set("drill_id", filters.drillId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const suffix = params.size ? `?${params.toString()}` : "";
  return read<AthleteResults>(`/api/athletes/${encodeURIComponent(athleteId)}/results${suffix}`);
}

export async function getDrillLeaderboard(drillId: string, teamId: string): Promise<DrillLeaderboard> {
  return read<DrillLeaderboard>(
    `/api/drills/${encodeURIComponent(drillId)}/leaderboard?team_id=${encodeURIComponent(teamId)}`,
  );
}

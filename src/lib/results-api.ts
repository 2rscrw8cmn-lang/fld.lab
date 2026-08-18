import { apiRequest, type DrillDefinition, type MeasurementType, type PersistedAttempt } from "@/lib/api";

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

export function metricForDefinition(definition: DrillDefinition): ResultMetric | null {
  const { measurement, attempts } = definition;
  let key: string;
  let label: string;
  let unit: string | null = measurement.unit ?? null;

  switch (measurement.type) {
    case "time":
      key = "total_time";
      label = "Time";
      unit = "ms";
      break;
    case "successes_attempts":
      key = "successes";
      label = "Successes";
      break;
    case "distance":
      key = "distance";
      label = "Distance";
      break;
    case "count":
      key = "count";
      label = "Count";
      break;
    case "rating":
      key = "rating";
      label = "Rating";
      break;
    case "custom_numeric": {
      const field = measurement.fields?.[0];
      if (!field) return null;
      key = field.key;
      label = field.label;
      unit = field.unit;
      break;
    }
  }

  return {
    type: measurement.type,
    key,
    label,
    unit,
    direction: measurement.direction,
    aggregation: attempts.result,
    total_attempts: measurement.type === "successes_attempts" ? measurement.total_attempts ?? null : null,
    max: measurement.type === "rating" ? measurement.max ?? null : null,
  };
}

export function aggregateResultValues(
  values: number[],
  aggregation: ResultMetric["aggregation"],
  direction: ResultMetric["direction"],
): number | null {
  if (!values.length) return null;
  switch (aggregation) {
    case "average": return values.reduce((sum, value) => sum + value, 0) / values.length;
    case "total": return values.reduce((sum, value) => sum + value, 0);
    case "latest": return values[values.length - 1];
    case "best":
      if (direction === "lower") return Math.min(...values);
      if (direction === "higher") return Math.max(...values);
      return values[values.length - 1];
  }
}

function attemptValue(attempt: PersistedAttempt, metric: ResultMetric) {
  if (metric.type === "time") {
    return attempt.measurements.find((measurement) => measurement.key === "total_time")?.value_numeric ?? attempt.elapsed_ms;
  }
  return attempt.measurements.find((measurement) => measurement.key === metric.key)?.value_numeric ?? null;
}

export function deriveSessionAthleteResult(definition: DrillDefinition, attempts: PersistedAttempt[]) {
  const metric = metricForDefinition(definition);
  if (!metric) return null;
  const values = [...attempts]
    .sort((a, b) => a.attempt_number - b.attempt_number || a.created_at.localeCompare(b.created_at))
    .map((attempt) => attemptValue(attempt, metric))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const value = aggregateResultValues(values, metric.aggregation, metric.direction);
  return value === null ? null : { value, metric, attempt_count: values.length };
}

export function formatResult(value: number | null, metric: ResultMetric | null) {
  if (value === null || !metric) return "—";
  if (metric.type === "time") {
    const totalSeconds = value / 1000;
    if (totalSeconds >= 60) {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds - minutes * 60;
      return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
    }
    return `${totalSeconds.toFixed(2)}s`;
  }
  if (metric.type === "successes_attempts" && metric.total_attempts !== null) {
    return `${Number.isInteger(value) ? value : value.toFixed(1)}/${metric.total_attempts}`;
  }
  if (metric.type === "rating" && metric.max !== null) {
    return `${Number.isInteger(value) ? value : value.toFixed(1)}/${metric.max}`;
  }
  const number = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
  return metric.unit && metric.unit !== "count" ? `${number} ${metric.unit}` : number;
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
  return apiRequest<AthleteResults>(`/api/athletes/${encodeURIComponent(athleteId)}/results${suffix}`);
}

export async function getDrillLeaderboard(drillId: string, teamId: string): Promise<DrillLeaderboard> {
  return apiRequest<DrillLeaderboard>(
    `/api/drills/${encodeURIComponent(drillId)}/leaderboard?team_id=${encodeURIComponent(teamId)}`,
  );
}

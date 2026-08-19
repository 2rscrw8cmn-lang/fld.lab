import type { D1Database } from "@cloudflare/workers-types";

import type { DrillDefinition, MeasurementType } from "../drills/definition";
import { RepositoryError } from "./repository";

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
  drill: {
    id: string;
    name: string;
    category: string;
    icon: string | null;
  };
  metric: ResultMetric | null;
  summary: ResultSummary;
  results: DerivedSessionResult[];
};

export type AthleteResults = {
  athlete: {
    id: string;
    first_name: string;
    last_name: string;
  };
  groups: AthleteResultGroup[];
};

export type LeaderboardEntry = {
  rank: number | null;
  athlete: {
    id: string;
    first_name: string;
    last_name: string;
  };
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
  drill: {
    id: string;
    name: string;
    category: string;
    icon: string | null;
  };
  metric: ResultMetric | null;
  entries: LeaderboardEntry[];
};

type ResultDbRow = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  jersey_number: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  session_id: string;
  team_id: string;
  drill_id: string;
  drill_version_id: string;
  session_started_at: string;
  session_completed_at: string | null;
  session_status: "active" | "completed" | "abandoned";
  drill_name: string;
  drill_category: string;
  drill_icon: string | null;
  definition_json: string;
  current_definition_json: string;
  attempt_id: string;
  attempt_number: number;
  attempt_created_at: string;
  elapsed_ms: number | null;
  measurement_key: string | null;
  measurement_value_numeric: number | null;
};

type AttemptRecord = {
  id: string;
  attempt_number: number;
  created_at: string;
  elapsed_ms: number | null;
  measurements: Map<string, number>;
};

type SessionBucket = {
  athlete_id: string;
  first_name: string;
  last_name: string;
  jersey_number: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  session_id: string;
  team_id: string;
  drill_id: string;
  drill_version_id: string;
  started_at: string;
  completed_at: string | null;
  session_status: "active" | "completed" | "abandoned";
  drill_name: string;
  drill_category: string;
  drill_icon: string | null;
  definition: DrillDefinition;
  current_definition: DrillDefinition;
  attempts: Map<string, AttemptRecord>;
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

function sameMetric(a: ResultMetric, b: ResultMetric) {
  return (
    a.type === b.type &&
    a.key === b.key &&
    a.unit === b.unit &&
    a.direction === b.direction &&
    a.aggregation === b.aggregation &&
    a.total_attempts === b.total_attempts &&
    a.max === b.max
  );
}

function valueForAttempt(metric: ResultMetric, attempt: AttemptRecord): number | null {
  if (metric.type === "time") {
    const measured = attempt.measurements.get("total_time");
    return measured ?? attempt.elapsed_ms;
  }
  return attempt.measurements.get(metric.key) ?? null;
}

export function aggregateResultValues(
  values: number[],
  aggregation: ResultMetric["aggregation"],
  direction: ResultMetric["direction"],
): number | null {
  if (!values.length) return null;
  switch (aggregation) {
    case "average":
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    case "total":
      return values.reduce((sum, value) => sum + value, 0);
    case "latest":
      return values[values.length - 1];
    case "best":
      if (direction === "lower") return Math.min(...values);
      if (direction === "higher") return Math.max(...values);
      return values[values.length - 1];
  }
}

function deriveSessionResult(bucket: SessionBucket): DerivedSessionResult | null {
  const metric = metricForDefinition(bucket.definition);
  if (!metric) return null;
  const attempts = [...bucket.attempts.values()].sort(
    (a, b) => a.attempt_number - b.attempt_number || a.created_at.localeCompare(b.created_at),
  );
  const values = attempts
    .map((attempt) => valueForAttempt(metric, attempt))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const value = aggregateResultValues(values, metric.aggregation, metric.direction);
  if (value === null) return null;

  return {
    session_id: bucket.session_id,
    team_id: bucket.team_id,
    drill_id: bucket.drill_id,
    drill_version_id: bucket.drill_version_id,
    athlete_id: bucket.athlete_id,
    started_at: bucket.started_at,
    completed_at: bucket.completed_at,
    session_status: bucket.session_status,
    value,
    attempt_count: values.length,
    metric,
  };
}

function summarize(results: DerivedSessionResult[], metric: ResultMetric | null): ResultSummary {
  const comparable = metric ? results.filter((result) => sameMetric(result.metric, metric)) : [];
  const newest = [...comparable].sort((a, b) => b.started_at.localeCompare(a.started_at));
  const latest = newest[0]?.value ?? null;
  const previous = newest[1]?.value ?? null;

  let pb: number | null = null;
  if (metric?.direction === "lower" && comparable.length) pb = Math.min(...comparable.map((result) => result.value));
  if (metric?.direction === "higher" && comparable.length) pb = Math.max(...comparable.map((result) => result.value));

  const change = latest !== null && previous !== null ? latest - previous : null;
  let improved: boolean | null = null;
  if (change !== null && metric?.direction === "lower") improved = change < 0;
  if (change !== null && metric?.direction === "higher") improved = change > 0;

  return {
    pb,
    latest,
    previous,
    change_from_previous: change,
    improved_from_previous: improved,
    result_count: comparable.length,
  };
}

async function queryRows(
  db: D1Database,
  filters: {
    athleteId?: string;
    teamId?: string;
    drillId?: string;
    from?: string;
    to?: string;
  },
): Promise<ResultDbRow[]> {
  // Performance surfaces only use completed sessions. Active and abandoned sessions
  // remain available through session history/detail but never affect PB/latest/ranking.
  const where = ["a.valid = 1", "s.status = 'completed'"];
  const bindings: string[] = [];
  if (filters.athleteId) {
    where.push("a.athlete_id = ?");
    bindings.push(filters.athleteId);
  }
  if (filters.teamId) {
    where.push("s.team_id = ?");
    bindings.push(filters.teamId);
  }
  if (filters.drillId) {
    where.push("s.drill_id = ?");
    bindings.push(filters.drillId);
  }
  if (filters.from) {
    where.push("s.started_at >= ?");
    bindings.push(filters.from);
  }
  if (filters.to) {
    where.push("s.started_at <= ?");
    bindings.push(filters.to);
  }

  const result = await db
    .prepare(
      `SELECT
        athlete.id AS athlete_id,
        athlete.first_name,
        athlete.last_name,
        tm.jersey_number,
        tm.primary_position,
        tm.secondary_position,
        s.id AS session_id,
        s.team_id,
        s.drill_id,
        s.drill_version_id,
        s.started_at AS session_started_at,
        s.completed_at AS session_completed_at,
        s.status AS session_status,
        d.name AS drill_name,
        d.category AS drill_category,
        d.icon AS drill_icon,
        dv.definition_json,
        current_dv.definition_json AS current_definition_json,
        a.id AS attempt_id,
        a.attempt_number,
        a.created_at AS attempt_created_at,
        a.elapsed_ms,
        m.key AS measurement_key,
        m.value_numeric AS measurement_value_numeric
      FROM attempts a
      JOIN athletes athlete ON athlete.id = a.athlete_id
      JOIN training_sessions s ON s.id = a.session_id
      JOIN drills d ON d.id = s.drill_id
      JOIN drill_versions dv ON dv.id = s.drill_version_id
      JOIN drill_versions current_dv ON current_dv.id = d.current_version_id
      LEFT JOIN team_memberships tm ON tm.team_id = s.team_id AND tm.athlete_id = a.athlete_id
      LEFT JOIN measurements m ON m.attempt_id = a.id
      WHERE ${where.join(" AND ")}
      ORDER BY s.started_at, a.attempt_number, a.created_at, m.sequence, m.key`,
    )
    .bind(...bindings)
    .all<ResultDbRow>();

  return result.results;
}

function sessionBuckets(rows: ResultDbRow[]): SessionBucket[] {
  const buckets = new Map<string, SessionBucket>();
  for (const row of rows) {
    const key = `${row.athlete_id}:${row.session_id}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        athlete_id: row.athlete_id,
        first_name: row.first_name,
        last_name: row.last_name,
        jersey_number: row.jersey_number,
        primary_position: row.primary_position,
        secondary_position: row.secondary_position,
        session_id: row.session_id,
        team_id: row.team_id,
        drill_id: row.drill_id,
        drill_version_id: row.drill_version_id,
        started_at: row.session_started_at,
        completed_at: row.session_completed_at,
        session_status: row.session_status,
        drill_name: row.drill_name,
        drill_category: row.drill_category,
        drill_icon: row.drill_icon,
        definition: JSON.parse(row.definition_json) as DrillDefinition,
        current_definition: JSON.parse(row.current_definition_json) as DrillDefinition,
        attempts: new Map(),
      };
      buckets.set(key, bucket);
    }

    let attempt = bucket.attempts.get(row.attempt_id);
    if (!attempt) {
      attempt = {
        id: row.attempt_id,
        attempt_number: row.attempt_number,
        created_at: row.attempt_created_at,
        elapsed_ms: row.elapsed_ms,
        measurements: new Map(),
      };
      bucket.attempts.set(row.attempt_id, attempt);
    }
    if (row.measurement_key && typeof row.measurement_value_numeric === "number") {
      attempt.measurements.set(row.measurement_key, row.measurement_value_numeric);
    }
  }
  return [...buckets.values()];
}

export async function getAthleteResults(
  db: D1Database,
  athleteId: string,
  filters: { teamId?: string; drillId?: string; from?: string; to?: string } = {},
): Promise<AthleteResults> {
  const athlete = await db
    .prepare("SELECT id, first_name, last_name FROM athletes WHERE id = ?")
    .bind(athleteId)
    .first<{ id: string; first_name: string; last_name: string }>();
  if (!athlete) throw new RepositoryError("not_found", "Athlete not found.");

  const buckets = sessionBuckets(await queryRows(db, { athleteId, ...filters }));
  const byDrill = new Map<string, { bucket: SessionBucket; results: DerivedSessionResult[] }>();

  for (const bucket of buckets) {
    const result = deriveSessionResult(bucket);
    if (!result) continue;
    const current = byDrill.get(bucket.drill_id) ?? { bucket, results: [] };
    current.results.push(result);
    byDrill.set(bucket.drill_id, current);
  }

  const groups: AthleteResultGroup[] = [...byDrill.values()]
    .map(({ bucket, results }) => {
      const metric = metricForDefinition(bucket.current_definition);
      const comparable = metric ? results.filter((result) => sameMetric(result.metric, metric)) : [];
      return {
        drill: {
          id: bucket.drill_id,
          name: bucket.drill_name,
          category: bucket.drill_category,
          icon: bucket.drill_icon,
        },
        metric,
        summary: summarize(results, metric),
        results: comparable.sort((a, b) => b.started_at.localeCompare(a.started_at)),
      };
    })
    .sort((a, b) => a.drill.name.localeCompare(b.drill.name));

  return { athlete, groups };
}

export async function getDrillLeaderboard(db: D1Database, drillId: string, teamId: string): Promise<DrillLeaderboard> {
  const drill = await db
    .prepare(
      `SELECT d.id, d.name, d.category, d.icon, dv.definition_json
       FROM drills d
       JOIN drill_versions dv ON dv.id = d.current_version_id
       WHERE d.id = ?`,
    )
    .bind(drillId)
    .first<{ id: string; name: string; category: string; icon: string | null; definition_json: string }>();
  if (!drill) throw new RepositoryError("not_found", "Drill not found.");

  const activeMemberships = await db
    .prepare("SELECT athlete_id FROM team_memberships WHERE team_id = ? AND active = 1")
    .bind(teamId)
    .all<{ athlete_id: string }>();
  const activeAthleteIds = new Set(activeMemberships.results.map((row) => row.athlete_id));

  const metric = metricForDefinition(JSON.parse(drill.definition_json) as DrillDefinition);
  const buckets = sessionBuckets(await queryRows(db, { teamId, drillId }));
  const byAthlete = new Map<string, { bucket: SessionBucket; results: DerivedSessionResult[] }>();
  for (const bucket of buckets) {
    if (!activeAthleteIds.has(bucket.athlete_id)) continue;
    const result = deriveSessionResult(bucket);
    if (!result || (metric && !sameMetric(result.metric, metric))) continue;
    const current = byAthlete.get(bucket.athlete_id) ?? { bucket, results: [] };
    current.results.push(result);
    byAthlete.set(bucket.athlete_id, current);
  }

  let entries: LeaderboardEntry[] = [...byAthlete.values()].map(({ bucket, results }) => {
    const summary = summarize(results, metric);
    return {
      rank: null,
      athlete: { id: bucket.athlete_id, first_name: bucket.first_name, last_name: bucket.last_name },
      membership: {
        jersey_number: bucket.jersey_number,
        primary_position: bucket.primary_position,
        secondary_position: bucket.secondary_position,
      },
      pb: summary.pb,
      latest: summary.latest,
      previous: summary.previous,
      result_count: summary.result_count,
    };
  });

  if (metric?.direction === "lower" || metric?.direction === "higher") {
    const multiplier = metric.direction === "lower" ? 1 : -1;
    entries = entries
      .filter((entry) => entry.pb !== null)
      .sort((a, b) => multiplier * ((a.pb ?? 0) - (b.pb ?? 0)) || a.athlete.last_name.localeCompare(b.athlete.last_name));
    let previousValue: number | null = null;
    let previousRank = 0;
    entries = entries.map((entry, index) => {
      const rank = previousValue !== null && entry.pb === previousValue ? previousRank : index + 1;
      previousValue = entry.pb;
      previousRank = rank;
      return { ...entry, rank };
    });
  } else {
    entries.sort((a, b) => a.athlete.last_name.localeCompare(b.athlete.last_name) || a.athlete.first_name.localeCompare(b.athlete.first_name));
  }

  return {
    drill: { id: drill.id, name: drill.name, category: drill.category, icon: drill.icon },
    metric,
    entries,
  };
}
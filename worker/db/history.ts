import type { D1Database } from "@cloudflare/workers-types";

import type { DrillDefinition } from "../drills/definition";
import { aggregateResultValues, metricForDefinition, type ResultMetric } from "./results";
import { RepositoryError } from "./repository";

export type SessionSummary = {
  id: string;
  team_id: string;
  drill_id: string;
  drill_version_id: string;
  drill_name: string;
  drill_category: string;
  started_at: string;
  completed_at: string | null;
  status: "active" | "completed" | "abandoned";
  athlete_count: number;
  completed_count: number;
  skipped_count: number;
  attempt_count: number;
};

export type TeamTrendPoint = {
  session_id: string;
  started_at: string;
  completed_at: string | null;
  status: "active" | "completed" | "abandoned";
  average: number;
  athlete_count: number;
};

export type TeamDrillTrend = {
  drill: { id: string; name: string; category: string };
  metric: ResultMetric | null;
  points: TeamTrendPoint[];
};

export type SessionResultContext = {
  session_id: string;
  metric: ResultMetric | null;
  athletes: Array<{
    athlete_id: string;
    pb: number | null;
    latest: number | null;
    previous: number | null;
    result_count: number;
  }>;
};

type HistoryRow = {
  session_id: string;
  started_at: string;
  completed_at: string | null;
  status: "active" | "completed" | "abandoned";
  drill_version_id: string;
  definition_json: string;
  athlete_id: string;
  attempt_id: string;
  attempt_number: number;
  attempt_created_at: string;
  elapsed_ms: number | null;
  measurement_key: string | null;
  measurement_value_numeric: number | null;
};

type AttemptBucket = {
  attempt_number: number;
  created_at: string;
  elapsed_ms: number | null;
  measurements: Map<string, number>;
};

type AthleteSessionBucket = {
  session_id: string;
  started_at: string;
  completed_at: string | null;
  status: "active" | "completed" | "abandoned";
  athlete_id: string;
  definition: DrillDefinition;
  attempts: Map<string, AttemptBucket>;
};

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

function attemptValue(metric: ResultMetric, attempt: AttemptBucket) {
  if (metric.type === "time") return attempt.measurements.get("total_time") ?? attempt.elapsed_ms;
  return attempt.measurements.get(metric.key) ?? null;
}

function aggregateBucket(bucket: AthleteSessionBucket): { value: number; metric: ResultMetric } | null {
  const metric = metricForDefinition(bucket.definition);
  if (!metric) return null;
  const values = [...bucket.attempts.values()]
    .sort((a, b) => a.attempt_number - b.attempt_number || a.created_at.localeCompare(b.created_at))
    .map((attempt) => attemptValue(metric, attempt))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const value = aggregateResultValues(values, metric.aggregation, metric.direction);
  return value === null ? null : { value, metric };
}

function buildBuckets(rows: HistoryRow[]) {
  const buckets = new Map<string, AthleteSessionBucket>();
  for (const row of rows) {
    const key = `${row.session_id}:${row.athlete_id}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        session_id: row.session_id,
        started_at: row.started_at,
        completed_at: row.completed_at,
        status: row.status,
        athlete_id: row.athlete_id,
        definition: JSON.parse(row.definition_json) as DrillDefinition,
        attempts: new Map(),
      };
      buckets.set(key, bucket);
    }
    let attempt = bucket.attempts.get(row.attempt_id);
    if (!attempt) {
      attempt = {
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

async function historyRows(
  db: D1Database,
  filters: { teamId: string; drillId: string; before?: string; excludeSessionId?: string },
): Promise<HistoryRow[]> {
  const where = ["s.team_id = ?", "s.drill_id = ?", "a.valid = 1"];
  const bindings: string[] = [filters.teamId, filters.drillId];
  if (filters.before) {
    where.push("s.started_at < ?");
    bindings.push(filters.before);
  }
  if (filters.excludeSessionId) {
    where.push("s.id <> ?");
    bindings.push(filters.excludeSessionId);
  }

  const result = await db
    .prepare(
      `SELECT
        s.id AS session_id,
        s.started_at,
        s.completed_at,
        s.status,
        s.drill_version_id,
        dv.definition_json,
        a.athlete_id,
        a.id AS attempt_id,
        a.attempt_number,
        a.created_at AS attempt_created_at,
        a.elapsed_ms,
        m.key AS measurement_key,
        m.value_numeric AS measurement_value_numeric
      FROM training_sessions s
      JOIN drill_versions dv ON dv.id = s.drill_version_id
      JOIN attempts a ON a.session_id = s.id
      LEFT JOIN measurements m ON m.attempt_id = a.id
      WHERE ${where.join(" AND ")}
      ORDER BY s.started_at, a.athlete_id, a.attempt_number, a.created_at, m.sequence, m.key`,
    )
    .bind(...bindings)
    .all<HistoryRow>();
  return result.results;
}

export async function listTeamSessions(db: D1Database, teamId: string, limit = 12): Promise<SessionSummary[]> {
  const team = await db.prepare("SELECT id FROM teams WHERE id = ?").bind(teamId).first<{ id: string }>();
  if (!team) throw new RepositoryError("not_found", "Team not found.");

  const result = await db
    .prepare(
      `SELECT
        s.id,
        s.team_id,
        s.drill_id,
        s.drill_version_id,
        d.name AS drill_name,
        d.category AS drill_category,
        s.started_at,
        s.completed_at,
        s.status,
        (SELECT COUNT(*) FROM session_athletes sa WHERE sa.session_id = s.id) AS athlete_count,
        (SELECT COUNT(*) FROM session_athletes sa WHERE sa.session_id = s.id AND sa.status = 'complete') AS completed_count,
        (SELECT COUNT(*) FROM session_athletes sa WHERE sa.session_id = s.id AND sa.status = 'skipped') AS skipped_count,
        (SELECT COUNT(*) FROM attempts a WHERE a.session_id = s.id AND a.valid = 1) AS attempt_count
      FROM training_sessions s
      JOIN drills d ON d.id = s.drill_id
      WHERE s.team_id = ?
      ORDER BY s.started_at DESC
      LIMIT ?`,
    )
    .bind(teamId, limit)
    .all<SessionSummary>();
  return result.results;
}

export async function getTeamDrillTrend(db: D1Database, teamId: string, drillId: string): Promise<TeamDrillTrend> {
  const drill = await db
    .prepare(
      `SELECT d.id, d.name, d.category, dv.definition_json
       FROM drills d
       JOIN drill_versions dv ON dv.id = d.current_version_id
       WHERE d.id = ?`,
    )
    .bind(drillId)
    .first<{ id: string; name: string; category: string; definition_json: string }>();
  if (!drill) throw new RepositoryError("not_found", "Drill not found.");

  const currentMetric = metricForDefinition(JSON.parse(drill.definition_json) as DrillDefinition);
  const buckets = buildBuckets(await historyRows(db, { teamId, drillId }));
  const sessionValues = new Map<string, { bucket: AthleteSessionBucket; values: number[] }>();

  for (const bucket of buckets) {
    const derived = aggregateBucket(bucket);
    if (!derived || (currentMetric && !sameMetric(derived.metric, currentMetric))) continue;
    const current = sessionValues.get(bucket.session_id) ?? { bucket, values: [] };
    current.values.push(derived.value);
    sessionValues.set(bucket.session_id, current);
  }

  const points = [...sessionValues.values()]
    .map(({ bucket, values }) => ({
      session_id: bucket.session_id,
      started_at: bucket.started_at,
      completed_at: bucket.completed_at,
      status: bucket.status,
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      athlete_count: values.length,
    }))
    .sort((a, b) => a.started_at.localeCompare(b.started_at));

  return {
    drill: { id: drill.id, name: drill.name, category: drill.category },
    metric: currentMetric,
    points,
  };
}

export async function getSessionResultContext(db: D1Database, sessionId: string): Promise<SessionResultContext> {
  const session = await db
    .prepare(
      `SELECT s.id, s.team_id, s.drill_id, s.started_at, dv.definition_json
       FROM training_sessions s
       JOIN drill_versions dv ON dv.id = s.drill_version_id
       WHERE s.id = ?`,
    )
    .bind(sessionId)
    .first<{ id: string; team_id: string; drill_id: string; started_at: string; definition_json: string }>();
  if (!session) throw new RepositoryError("not_found", "Training session not found.");

  const metric = metricForDefinition(JSON.parse(session.definition_json) as DrillDefinition);
  const queue = await db
    .prepare("SELECT athlete_id FROM session_athletes WHERE session_id = ? ORDER BY order_index")
    .bind(sessionId)
    .all<{ athlete_id: string }>();
  const byAthlete = new Map<string, Array<{ value: number; started_at: string }>>();

  if (metric) {
    const buckets = buildBuckets(
      await historyRows(db, {
        teamId: session.team_id,
        drillId: session.drill_id,
        before: session.started_at,
        excludeSessionId: session.id,
      }),
    );
    for (const bucket of buckets) {
      const derived = aggregateBucket(bucket);
      if (!derived || !sameMetric(derived.metric, metric)) continue;
      const values = byAthlete.get(bucket.athlete_id) ?? [];
      values.push({ value: derived.value, started_at: bucket.started_at });
      byAthlete.set(bucket.athlete_id, values);
    }
  }

  const athletes = queue.results.map(({ athlete_id }) => {
    const values = [...(byAthlete.get(athlete_id) ?? [])].sort((a, b) => b.started_at.localeCompare(a.started_at));
    const latest = values[0]?.value ?? null;
    const previous = values[1]?.value ?? null;
    let pb: number | null = null;
    if (metric?.direction === "lower" && values.length) pb = Math.min(...values.map((item) => item.value));
    if (metric?.direction === "higher" && values.length) pb = Math.max(...values.map((item) => item.value));
    return { athlete_id, pb, latest, previous, result_count: values.length };
  });

  return { session_id: session.id, metric, athletes };
}

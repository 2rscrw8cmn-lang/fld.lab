import type { D1Database } from "@cloudflare/workers-types";

import type { DrillDefinition } from "../drills/definition";
import { getDrill } from "./drills";
import { getRoster } from "./repository";

export type TrainingSessionStatus = "active" | "completed" | "abandoned";
export type SessionAthleteStatus = "pending" | "active" | "complete" | "skipped";

export type TrainingSession = {
  id: string;
  team_id: string;
  drill_id: string;
  drill_version_id: string;
  started_at: string;
  completed_at: string | null;
  status: TrainingSessionStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionAthleteView = {
  id: string;
  session_id: string;
  athlete_id: string;
  order_index: number;
  status: SessionAthleteStatus;
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
};

export type MeasurementInput = {
  key: string;
  label: string;
  value_numeric: number | null;
  value_text?: string | null;
  unit: string | null;
  sequence: number;
};

export type PersistedMeasurement = MeasurementInput & {
  id: string;
  attempt_id: string;
  created_at: string;
};

export type PersistedAttempt = {
  id: string;
  client_attempt_id: string;
  session_id: string;
  athlete_id: string;
  attempt_number: number;
  started_at: string | null;
  stopped_at: string | null;
  elapsed_ms: number | null;
  valid: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
  measurements: PersistedMeasurement[];
};

export type SessionDetail = {
  session: TrainingSession;
  drill_definition: DrillDefinition;
  athletes: SessionAthleteView[];
  attempts: PersistedAttempt[];
};

export type AttemptInput = {
  client_attempt_id: string;
  athlete_id: string;
  attempt_number: number;
  started_at?: string | null;
  stopped_at?: string | null;
  elapsed_ms: number;
  valid: boolean;
  note?: string | null;
  measurements: MeasurementInput[];
};

export class TrainingSessionError extends Error {
  constructor(
    public readonly code: "not_found" | "conflict" | "validation_error" | "active_session_conflict",
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

type SessionAthleteDbRow = {
  id: string;
  session_id: string;
  athlete_id: string;
  order_index: number;
  status: SessionAthleteStatus;
  first_name: string;
  last_name: string;
  jersey_number: string | null;
  primary_position: string | null;
  secondary_position: string | null;
};

type AttemptDbRow = Omit<PersistedAttempt, "valid" | "measurements"> & { valid: number; request_json: string };
type MeasurementDbRow = PersistedMeasurement;

const nowIso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

async function requireSession(db: D1Database, sessionId: string): Promise<TrainingSession> {
  const session = await db.prepare("SELECT * FROM training_sessions WHERE id = ?").bind(sessionId).first<TrainingSession>();
  if (!session) throw new TrainingSessionError("not_found", "Training session not found.");
  return session;
}

async function definitionForSession(db: D1Database, session: TrainingSession): Promise<DrillDefinition> {
  const row = await db
    .prepare("SELECT definition_json FROM drill_versions WHERE id = ? AND drill_id = ?")
    .bind(session.drill_version_id, session.drill_id)
    .first<{ definition_json: string }>();
  if (!row) throw new Error(`Drill version ${session.drill_version_id} was not found.`);
  return JSON.parse(row.definition_json) as DrillDefinition;
}

function attemptFromRow(row: AttemptDbRow, measurements: PersistedMeasurement[]): PersistedAttempt {
  return {
    id: row.id,
    client_attempt_id: row.client_attempt_id,
    session_id: row.session_id,
    athlete_id: row.athlete_id,
    attempt_number: row.attempt_number,
    started_at: row.started_at,
    stopped_at: row.stopped_at,
    elapsed_ms: row.elapsed_ms,
    valid: row.valid === 1,
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
    measurements,
  };
}

export async function getSession(db: D1Database, sessionId: string): Promise<SessionDetail> {
  const session = await requireSession(db, sessionId);
  const drill_definition = await definitionForSession(db, session);

  const athleteRows = await db
    .prepare(
      `SELECT
        sa.id,
        sa.session_id,
        sa.athlete_id,
        sa.order_index,
        sa.status,
        a.first_name,
        a.last_name,
        tm.jersey_number,
        tm.primary_position,
        tm.secondary_position
      FROM session_athletes sa
      JOIN training_sessions s ON s.id = sa.session_id
      JOIN athletes a ON a.id = sa.athlete_id
      LEFT JOIN team_memberships tm ON tm.team_id = s.team_id AND tm.athlete_id = sa.athlete_id
      WHERE sa.session_id = ?
      ORDER BY sa.order_index`,
    )
    .bind(sessionId)
    .all<SessionAthleteDbRow>();

  const attemptRows = await db
    .prepare("SELECT * FROM attempts WHERE session_id = ? ORDER BY created_at, attempt_number")
    .bind(sessionId)
    .all<AttemptDbRow>();
  const measurementRows = await db
    .prepare(
      `SELECT m.*
       FROM measurements m
       JOIN attempts a ON a.id = m.attempt_id
       WHERE a.session_id = ?
       ORDER BY a.created_at, m.sequence, m.key`,
    )
    .bind(sessionId)
    .all<MeasurementDbRow>();

  const measurementsByAttempt = new Map<string, PersistedMeasurement[]>();
  for (const measurement of measurementRows.results) {
    const current = measurementsByAttempt.get(measurement.attempt_id) ?? [];
    current.push(measurement);
    measurementsByAttempt.set(measurement.attempt_id, current);
  }

  return {
    session,
    drill_definition,
    athletes: athleteRows.results.map((row) => ({
      id: row.id,
      session_id: row.session_id,
      athlete_id: row.athlete_id,
      order_index: row.order_index,
      status: row.status,
      athlete: {
        id: row.athlete_id,
        first_name: row.first_name,
        last_name: row.last_name,
      },
      membership: {
        jersey_number: row.jersey_number,
        primary_position: row.primary_position,
        secondary_position: row.secondary_position,
      },
    })),
    attempts: attemptRows.results.map((row) => attemptFromRow(row, measurementsByAttempt.get(row.id) ?? [])),
  };
}

export async function getActiveSession(db: D1Database, teamId: string): Promise<SessionDetail | null> {
  const row = await db
    .prepare("SELECT id FROM training_sessions WHERE team_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1")
    .bind(teamId)
    .first<{ id: string }>();
  return row ? getSession(db, row.id) : null;
}

export async function createSession(db: D1Database, teamId: string, drillId: string): Promise<SessionDetail> {
  const active = await getActiveSession(db, teamId);
  if (active) {
    throw new TrainingSessionError("active_session_conflict", "This team already has an active training session.", {
      session_id: active.session.id,
    });
  }

  const drillDetail = await getDrill(db, drillId);
  if (drillDetail.version.definition.measurement.type !== "time") {
    throw new TrainingSessionError("validation_error", "Phase 3A supports timed drills only.", {
      drill_id: "Choose a drill with measurement.type = time",
    });
  }

  const roster = await getRoster(db, teamId);
  if (!roster.length) {
    throw new TrainingSessionError("conflict", "Add at least one active athlete before starting a session.");
  }

  const timestamp = nowIso();
  const session: TrainingSession = {
    id: id("session"),
    team_id: teamId,
    drill_id: drillDetail.drill.id,
    drill_version_id: drillDetail.version.id,
    started_at: timestamp,
    completed_at: null,
    status: "active",
    notes: null,
    created_by: null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const statements = [
    db
      .prepare(
        `INSERT INTO training_sessions
          (id, team_id, drill_id, drill_version_id, started_at, completed_at, status, notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, 'active', NULL, NULL, ?, ?)`,
      )
      .bind(session.id, teamId, drillId, drillDetail.version.id, timestamp, timestamp, timestamp),
    ...roster.map((row, orderIndex) =>
      db
        .prepare(
          `INSERT INTO session_athletes
            (id, session_id, athlete_id, order_index, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
        )
        .bind(id("session_athlete"), session.id, row.athlete.id, orderIndex, timestamp, timestamp),
    ),
  ];

  await db.batch(statements);
  return getSession(db, session.id);
}

function normalizeAttempt(input: AttemptInput) {
  return {
    athlete_id: input.athlete_id,
    attempt_number: input.attempt_number,
    started_at: input.started_at ?? null,
    stopped_at: input.stopped_at ?? null,
    elapsed_ms: input.elapsed_ms,
    valid: input.valid,
    note: input.note ?? null,
    measurements: [...input.measurements]
      .map((measurement) => ({
        key: measurement.key,
        label: measurement.label,
        value_numeric: measurement.value_numeric,
        value_text: measurement.value_text ?? null,
        unit: measurement.unit,
        sequence: measurement.sequence,
      }))
      .sort((a, b) => a.sequence - b.sequence || a.key.localeCompare(b.key)),
  };
}

function validateTimedAttempt(definition: DrillDefinition, input: AttemptInput): Record<string, string> {
  const fields: Record<string, string> = {};
  if (definition.measurement.type !== "time") {
    fields.drill = "Session drill is not timed";
    return fields;
  }
  if (!Number.isInteger(input.attempt_number) || input.attempt_number < 1 || input.attempt_number > definition.attempts.count) {
    fields.attempt_number = `Must be between 1 and ${definition.attempts.count}`;
  }
  if (!Number.isInteger(input.elapsed_ms) || input.elapsed_ms <= 0) fields.elapsed_ms = "Must be a positive integer millisecond value";

  const seen = new Set<string>();
  const configuredSplits = new Set((definition.timer?.splits ?? []).map((split) => split.key));
  let totalTimeCount = 0;
  for (const [index, measurement] of input.measurements.entries()) {
    if (seen.has(measurement.key)) fields[`measurements.${index}.key`] = "Measurement keys must be unique";
    seen.add(measurement.key);
    if (measurement.key === "total_time") {
      totalTimeCount += 1;
      if (measurement.unit !== "ms") fields[`measurements.${index}.unit`] = "Timed values use ms";
      if (measurement.value_numeric !== input.elapsed_ms) fields[`measurements.${index}.value_numeric`] = "Must equal elapsed_ms";
      continue;
    }
    if (!configuredSplits.has(measurement.key)) fields[`measurements.${index}.key`] = "Unknown split key";
    if (measurement.unit !== "ms") fields[`measurements.${index}.unit`] = "Timed splits use ms";
    if (!Number.isInteger(measurement.value_numeric) || (measurement.value_numeric ?? 0) <= 0) {
      fields[`measurements.${index}.value_numeric`] = "Split must be a positive integer millisecond value";
    } else if ((measurement.value_numeric ?? 0) > input.elapsed_ms) {
      fields[`measurements.${index}.value_numeric`] = "Split cannot exceed total time";
    }
  }
  if (totalTimeCount !== 1) fields.measurements = "Exactly one total_time measurement is required";
  return fields;
}

async function getAttempt(db: D1Database, attemptId: string): Promise<PersistedAttempt> {
  const row = await db.prepare("SELECT * FROM attempts WHERE id = ?").bind(attemptId).first<AttemptDbRow>();
  if (!row) throw new TrainingSessionError("not_found", "Attempt not found.");
  const measurements = await db
    .prepare("SELECT * FROM measurements WHERE attempt_id = ? ORDER BY sequence, key")
    .bind(attemptId)
    .all<MeasurementDbRow>();
  return attemptFromRow(row, measurements.results);
}

export async function persistAttempt(
  db: D1Database,
  sessionId: string,
  input: AttemptInput,
): Promise<{ attempt: PersistedAttempt; created: boolean }> {
  const session = await requireSession(db, sessionId);
  if (session.status !== "active") throw new TrainingSessionError("conflict", "Session is no longer active.");
  const definition = await definitionForSession(db, session);

  const queueRow = await db
    .prepare("SELECT status FROM session_athletes WHERE session_id = ? AND athlete_id = ?")
    .bind(sessionId, input.athlete_id)
    .first<{ status: SessionAthleteStatus }>();
  if (!queueRow) throw new TrainingSessionError("validation_error", "Athlete is not part of this session.", { athlete_id: "Not in session queue" });
  if (queueRow.status === "skipped") throw new TrainingSessionError("conflict", "Unskip the athlete before saving an attempt.");

  const fields = validateTimedAttempt(definition, input);
  if (Object.keys(fields).length) throw new TrainingSessionError("validation_error", "One or more attempt fields are invalid.", fields);

  const requestJson = JSON.stringify(normalizeAttempt(input));
  const existingClient = await db
    .prepare("SELECT id, request_json FROM attempts WHERE client_attempt_id = ?")
    .bind(input.client_attempt_id)
    .first<{ id: string; request_json: string }>();
  if (existingClient) {
    if (existingClient.request_json !== requestJson) {
      throw new TrainingSessionError("conflict", "client_attempt_id was already used with different attempt data.");
    }
    return { attempt: await getAttempt(db, existingClient.id), created: false };
  }

  const existingNumber = await db
    .prepare("SELECT id FROM attempts WHERE session_id = ? AND athlete_id = ? AND attempt_number = ?")
    .bind(sessionId, input.athlete_id, input.attempt_number)
    .first<{ id: string }>();
  if (existingNumber) throw new TrainingSessionError("conflict", "This attempt number is already saved for the athlete.");

  const timestamp = nowIso();
  const attemptId = id("attempt");
  const statements = [
    db
      .prepare(
        `INSERT INTO attempts
          (id, client_attempt_id, session_id, athlete_id, attempt_number, started_at, stopped_at, elapsed_ms, valid, note, request_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        attemptId,
        input.client_attempt_id,
        sessionId,
        input.athlete_id,
        input.attempt_number,
        input.started_at ?? null,
        input.stopped_at ?? null,
        input.elapsed_ms,
        input.valid ? 1 : 0,
        input.note ?? null,
        requestJson,
        timestamp,
        timestamp,
      ),
    ...normalizeAttempt(input).measurements.map((measurement) =>
      db
        .prepare(
          `INSERT INTO measurements
            (id, attempt_id, key, label, value_numeric, value_text, unit, sequence, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id("measurement"),
          attemptId,
          measurement.key,
          measurement.label,
          measurement.value_numeric,
          measurement.value_text,
          measurement.unit,
          measurement.sequence,
          timestamp,
        ),
    ),
    db
      .prepare(
        `UPDATE session_athletes
         SET status = 'complete', updated_at = ?
         WHERE session_id = ? AND athlete_id = ? AND status <> 'skipped'
           AND (SELECT COUNT(*) FROM attempts WHERE session_id = ? AND athlete_id = ?) >= ?`,
      )
      .bind(timestamp, sessionId, input.athlete_id, sessionId, input.athlete_id, definition.attempts.count),
  ];

  await db.batch(statements);
  return { attempt: await getAttempt(db, attemptId), created: true };
}

export async function setSessionAthleteStatus(
  db: D1Database,
  sessionId: string,
  athleteId: string,
  status: "skipped" | "pending",
): Promise<SessionAthleteStatus> {
  const session = await requireSession(db, sessionId);
  if (session.status !== "active") throw new TrainingSessionError("conflict", "Session is no longer active.");
  const existing = await db
    .prepare("SELECT id FROM session_athletes WHERE session_id = ? AND athlete_id = ?")
    .bind(sessionId, athleteId)
    .first<{ id: string }>();
  if (!existing) throw new TrainingSessionError("not_found", "Session athlete not found.");

  let nextStatus: SessionAthleteStatus = status;
  if (status === "pending") {
    const definition = await definitionForSession(db, session);
    const count = await db
      .prepare("SELECT COUNT(*) AS count FROM attempts WHERE session_id = ? AND athlete_id = ?")
      .bind(sessionId, athleteId)
      .first<{ count: number }>();
    nextStatus = (count?.count ?? 0) >= definition.attempts.count ? "complete" : "pending";
  }

  await db
    .prepare("UPDATE session_athletes SET status = ?, updated_at = ? WHERE session_id = ? AND athlete_id = ?")
    .bind(nextStatus, nowIso(), sessionId, athleteId)
    .run();
  return nextStatus;
}

export async function updateSessionStatus(
  db: D1Database,
  sessionId: string,
  status: "completed" | "abandoned",
): Promise<TrainingSession> {
  const session = await requireSession(db, sessionId);
  if (session.status !== "active") throw new TrainingSessionError("conflict", "Session is no longer active.");

  if (status === "completed") {
    const unfinished = await db
      .prepare("SELECT COUNT(*) AS count FROM session_athletes WHERE session_id = ? AND status NOT IN ('complete', 'skipped')")
      .bind(sessionId)
      .first<{ count: number }>();
    if ((unfinished?.count ?? 0) > 0) {
      throw new TrainingSessionError("conflict", "Complete or skip every athlete before finishing the session.");
    }
  }

  const timestamp = nowIso();
  await db
    .prepare("UPDATE training_sessions SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?")
    .bind(status, timestamp, timestamp, sessionId)
    .run();
  return requireSession(db, sessionId);
}

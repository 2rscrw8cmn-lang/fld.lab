import type { D1Database } from "@cloudflare/workers-types";

import {
  TrainingSessionError,
  createSession,
  getActiveSession,
  getSession,
  persistAttempt,
  setSessionAthleteStatus,
  updateSessionStatus,
  type AttemptInput,
  type MeasurementInput,
} from "../db/sessions";

type JsonObject = Record<string, unknown>;

function errorResponse(code: string, message: string, status: number, fields?: Record<string, string>) {
  return Response.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status });
}

async function readJson(request: Request): Promise<JsonObject | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
  } catch {
    return null;
  }
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value.trim() || null : undefined;
}

function parseMeasurements(value: unknown): MeasurementInput[] | null {
  if (!Array.isArray(value)) return null;
  const parsed: MeasurementInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const object = item as JsonObject;
    const key = requiredString(object.key);
    const label = requiredString(object.label);
    const unit = object.unit === null ? null : requiredString(object.unit);
    const valueNumeric = object.value_numeric === null ? null : object.value_numeric;
    const valueText = nullableString(object.value_text);
    const sequence = object.sequence;
    if (
      !key ||
      !label ||
      (object.unit !== null && !unit) ||
      (valueNumeric !== null && typeof valueNumeric !== "number") ||
      valueText === undefined ||
      typeof sequence !== "number" ||
      !Number.isInteger(sequence) ||
      sequence < 0
    ) {
      return null;
    }
    parsed.push({ key, label, value_numeric: valueNumeric as number | null, value_text: valueText, unit, sequence });
  }
  return parsed;
}

function parseAttempt(body: JsonObject): AttemptInput | null {
  const client_attempt_id = requiredString(body.client_attempt_id);
  const athlete_id = requiredString(body.athlete_id);
  const attempt_number = body.attempt_number;
  const started_at = nullableString(body.started_at);
  const stopped_at = nullableString(body.stopped_at);
  const elapsed_ms = body.elapsed_ms;
  const valid = body.valid;
  const note = nullableString(body.note);
  const measurements = parseMeasurements(body.measurements);

  if (
    !client_attempt_id ||
    !athlete_id ||
    typeof attempt_number !== "number" ||
    !Number.isInteger(attempt_number) ||
    started_at === undefined ||
    stopped_at === undefined ||
    typeof elapsed_ms !== "number" ||
    !Number.isInteger(elapsed_ms) ||
    typeof valid !== "boolean" ||
    note === undefined ||
    !measurements
  ) {
    return null;
  }

  return {
    client_attempt_id,
    athlete_id,
    attempt_number,
    started_at,
    stopped_at,
    elapsed_ms,
    valid,
    note,
    measurements,
  };
}

export async function handleSessionApi(request: Request, db: D1Database): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  try {
    const activeSessionMatch = pathname.match(/^\/api\/teams\/([^/]+)\/active-session$/);
    if (activeSessionMatch && request.method === "GET") {
      const teamId = decodeURIComponent(activeSessionMatch[1]);
      return Response.json({ session: await getActiveSession(db, teamId) });
    }

    if (pathname === "/api/sessions" && request.method === "POST") {
      const body = await readJson(request);
      if (!body) return errorResponse("validation_error", "Request body must be a JSON object.", 400);
      const teamId = requiredString(body.team_id);
      const drillId = requiredString(body.drill_id);
      const fields: Record<string, string> = {};
      if (!teamId) fields.team_id = "Required";
      if (!drillId) fields.drill_id = "Required";
      if (Object.keys(fields).length) return errorResponse("validation_error", "One or more fields are invalid.", 400, fields);
      return Response.json(await createSession(db, teamId!, drillId!), { status: 201 });
    }

    const attemptMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/attempts$/);
    if (attemptMatch && request.method === "POST") {
      const body = await readJson(request);
      if (!body) return errorResponse("validation_error", "Request body must be a JSON object.", 400);
      const input = parseAttempt(body);
      if (!input) return errorResponse("validation_error", "Attempt payload is malformed.", 400);
      const result = await persistAttempt(db, decodeURIComponent(attemptMatch[1]), input);
      return Response.json(result.attempt, { status: result.created ? 201 : 200 });
    }

    const athleteMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/athletes\/([^/]+)$/);
    if (athleteMatch && request.method === "PATCH") {
      const body = await readJson(request);
      if (!body) return errorResponse("validation_error", "Request body must be a JSON object.", 400);
      if (body.status !== "skipped" && body.status !== "pending") {
        return errorResponse("validation_error", "status must be skipped or pending.", 400, { status: "Invalid status" });
      }
      const sessionId = decodeURIComponent(athleteMatch[1]);
      const athleteId = decodeURIComponent(athleteMatch[2]);
      const status = await setSessionAthleteStatus(db, sessionId, athleteId, body.status);
      return Response.json({ athlete_id: athleteId, status });
    }

    const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1]);
      if (request.method === "GET") return Response.json(await getSession(db, sessionId));
      if (request.method === "PATCH") {
        const body = await readJson(request);
        if (!body) return errorResponse("validation_error", "Request body must be a JSON object.", 400);
        if (body.status !== "completed" && body.status !== "abandoned") {
          return errorResponse("validation_error", "status must be completed or abandoned.", 400, { status: "Invalid status" });
        }
        return Response.json(await updateSessionStatus(db, sessionId, body.status));
      }
    }

    return null;
  } catch (error) {
    if (error instanceof TrainingSessionError) {
      const status = error.code === "not_found" ? 404 : error.code === "validation_error" ? 400 : 409;
      return errorResponse(error.code, error.message, status, error.fields);
    }
    throw error;
  }
}

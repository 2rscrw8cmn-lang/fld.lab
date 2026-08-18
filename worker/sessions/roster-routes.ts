import type { D1Database } from "@cloudflare/workers-types";

import { addRosterAthletesToSession } from "../db/session-roster";
import { TrainingSessionError } from "../db/sessions";

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

export async function handleSessionRosterApi(request: Request, db: D1Database): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/^\/api\/sessions\/([^/]+)\/athletes$/);
  if (!match || request.method !== "POST") return null;

  try {
    const body = await readJson(request);
    if (!body) return errorResponse("validation_error", "Request body must be a JSON object.", 400);
    if (!Array.isArray(body.athlete_ids) || body.athlete_ids.some((value) => typeof value !== "string" || !value.trim())) {
      return errorResponse("validation_error", "athlete_ids must be an array of athlete IDs.", 400, {
        athlete_ids: "Provide one or more athlete IDs",
      });
    }

    const detail = await addRosterAthletesToSession(
      db,
      decodeURIComponent(match[1]),
      body.athlete_ids as string[],
    );
    return Response.json(detail);
  } catch (error) {
    if (error instanceof TrainingSessionError) {
      const status = error.code === "not_found" ? 404 : error.code === "validation_error" ? 400 : 409;
      return errorResponse(error.code, error.message, status, error.fields);
    }
    throw error;
  }
}

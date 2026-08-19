import type { D1Database } from "@cloudflare/workers-types";

import { listPlayPersonnel, replacePlayPersonnel, type PersonnelInput } from "../db/play-personnel";
import { getPlay } from "../db/plays";
import { RepositoryError } from "../db/repository";

type JsonObject = Record<string, unknown>;

function errorResponse(code: string, message: string, status: number, fields?: Record<string, string>) {
  return Response.json(
    { error: { code, message, ...(fields ? { fields } : {}) } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function readJson(request: Request): Promise<JsonObject | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
  } catch {
    return null;
  }
}

function boundedString(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : null;
}

export function validatePersonnelAssignments(
  value: unknown,
  validPlayerIds: Set<string>,
): { assignments?: PersonnelInput[]; message?: string } {
  if (!Array.isArray(value) || value.length > 12) {
    return { message: "assignments must be an array with at most 12 entries." };
  }

  const assignments: PersonnelInput[] = [];
  const playerIds = new Set<string>();
  const athleteIds = new Set<string>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return { message: "Each personnel assignment must be an object." };
    }
    const raw = candidate as JsonObject;
    const playerId = boundedString(raw.player_id, 100);
    const athleteId = boundedString(raw.athlete_id, 100);
    if (!playerId || !athleteId) {
      return { message: "Each personnel assignment requires player_id and athlete_id." };
    }
    if (!validPlayerIds.has(playerId)) {
      return { message: "Personnel player_id must reference a player in the play diagram." };
    }
    if (playerIds.has(playerId)) {
      return { message: "A play position can only have one athlete." };
    }
    if (athleteIds.has(athleteId)) {
      return { message: "An athlete can only fill one position in a play." };
    }
    playerIds.add(playerId);
    athleteIds.add(athleteId);
    assignments.push({ player_id: playerId, athlete_id: athleteId });
  }

  return { assignments };
}

function diagramPlayerIds(diagram: unknown) {
  if (!diagram || typeof diagram !== "object" || Array.isArray(diagram)) return new Set<string>();
  const raw = diagram as JsonObject;
  if (!Array.isArray(raw.players)) return new Set<string>();
  return new Set(
    raw.players.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const playerId = boundedString((candidate as JsonObject).id, 100);
      return playerId ? [playerId] : [];
    }),
  );
}

export async function handlePlayPersonnelApi(request: Request, db: D1Database): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/^\/api\/teams\/([^/]+)\/plays\/([^/]+)\/personnel$/);
  if (!match) return null;

  const teamId = decodeURIComponent(match[1]);
  const playId = decodeURIComponent(match[2]);

  try {
    if (request.method === "GET") {
      return Response.json(
        { personnel: await listPlayPersonnel(db, teamId, playId) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (request.method === "PUT") {
      const body = await readJson(request);
      if (!body) return errorResponse("validation_error", "Request body must be a JSON object.", 400);

      const play = await getPlay(db, teamId, playId);
      const parsed = validatePersonnelAssignments(body.assignments, diagramPlayerIds(play.diagram));
      if (!parsed.assignments) {
        return errorResponse(
          "validation_error",
          "Personnel assignments are invalid.",
          400,
          { assignments: parsed.message ?? "Invalid personnel assignments." },
        );
      }

      return Response.json(
        { personnel: await replacePlayPersonnel(db, teamId, playId, parsed.assignments) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return null;
  } catch (error) {
    if (error instanceof RepositoryError) {
      return errorResponse(error.code, error.message, error.code === "not_found" ? 404 : 409);
    }
    console.error("Unhandled play personnel API error", error instanceof Error ? error.name : "unknown");
    return errorResponse("internal_error", "An unexpected error occurred.", 500);
  }
}

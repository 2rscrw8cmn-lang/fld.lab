import type { D1Database } from "@cloudflare/workers-types";

import { createPlay, getPlay, listPlays, updatePlay, type PlayInput } from "../db/plays";
import { RepositoryError } from "../db/repository";

type JsonObject = Record<string, unknown>;
type Point = { x: number; y: number };
type DiagramPlayer = Point & { id: string; label: string };
type DiagramAssignment = {
  id: string;
  player_id: string;
  kind: "route" | "motion";
  template?: string;
  points: Point[];
};
type PlayDiagram = {
  schema_version: 2;
  players: DiagramPlayer[];
  assignments: DiagramAssignment[];
  primary_target_player_id: string | null;
};

const ROUTE_TEMPLATES = new Set(["go", "slant", "out", "in", "post", "corner", "hitch", "drag"]);

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

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : null;
}

function optionalString(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length <= max ? normalized : undefined;
}

function coordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function validateDiagram(value: unknown): PlayDiagram | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as JsonObject;
  if (raw.schema_version !== 2 || !Array.isArray(raw.players) || !Array.isArray(raw.assignments)) return null;
  if (raw.players.length < 1 || raw.players.length > 12 || raw.assignments.length > 30) return null;

  const players: DiagramPlayer[] = [];
  const playerIds = new Set<string>();
  for (const candidate of raw.players) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const player = candidate as JsonObject;
    const playerId = boundedString(player.id, 100);
    const label = boundedString(player.label, 8);
    const x = coordinate(player.x);
    const y = coordinate(player.y);
    if (!playerId || !label || x === null || y === null || playerIds.has(playerId)) return null;
    playerIds.add(playerId);
    players.push({ id: playerId, label, x, y });
  }

  const assignments: DiagramAssignment[] = [];
  const assignmentIds = new Set<string>();
  for (const candidate of raw.assignments) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const assignment = candidate as JsonObject;
    const assignmentId = boundedString(assignment.id, 100);
    const playerId = boundedString(assignment.player_id, 100);
    const kind = assignment.kind === "route" || assignment.kind === "motion" ? assignment.kind : null;
    const template = assignment.template === undefined ? undefined : boundedString(assignment.template, 32);
    if (!assignmentId || !playerId || !kind || !playerIds.has(playerId) || assignmentIds.has(assignmentId)) return null;
    if (kind === "route" && template && !ROUTE_TEMPLATES.has(template)) return null;
    if (!Array.isArray(assignment.points) || assignment.points.length < 2 || assignment.points.length > 8) return null;

    const points: Point[] = [];
    for (const pointValue of assignment.points) {
      if (!pointValue || typeof pointValue !== "object" || Array.isArray(pointValue)) return null;
      const point = pointValue as JsonObject;
      const x = coordinate(point.x);
      const y = coordinate(point.y);
      if (x === null || y === null) return null;
      points.push({ x, y });
    }

    assignmentIds.add(assignmentId);
    assignments.push({
      id: assignmentId,
      player_id: playerId,
      kind,
      ...(template ? { template } : {}),
      points,
    });
  }

  const primary = raw.primary_target_player_id === null
    ? null
    : boundedString(raw.primary_target_player_id, 100);
  if (primary && !playerIds.has(primary)) return null;
  if (raw.primary_target_player_id !== null && primary === null) return null;

  return { schema_version: 2, players, assignments, primary_target_player_id: primary };
}

function parsePlayInput(body: JsonObject): { input?: PlayInput; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const name = boundedString(body.name, 120);
  const side = body.side === "offense" || body.side === "defense" ? body.side : null;
  const formationId = optionalString(body.formation_id, 80);
  const formation = typeof body.formation === "string" && body.formation.trim().length <= 120 ? body.formation.trim() : undefined;
  const notes = typeof body.notes === "string" && body.notes.length <= 4000 ? body.notes.trim() : undefined;
  const diagram = validateDiagram(body.diagram);

  if (!name) fields.name = "Required; maximum 120 characters";
  if (!side) fields.side = "Must be offense or defense";
  if (body.formation_id !== undefined && formationId === undefined) fields.formation_id = "Must be a string or null";
  if (formation === undefined) fields.formation = "Must be a string up to 120 characters";
  if (notes === undefined) fields.notes = "Must be a string up to 4000 characters";
  if (!diagram) fields.diagram = "Must be a valid Playbook schema v2 diagram";

  if (Object.keys(fields).length) return { fields };
  return {
    fields,
    input: {
      name: name!,
      side: side!,
      formation_id: formationId ?? null,
      formation: formation!,
      notes: notes!,
      diagram: diagram!,
    },
  };
}

export async function handlePlaybookApi(request: Request, db: D1Database): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  try {
    const collectionMatch = pathname.match(/^\/api\/teams\/([^/]+)\/plays$/);
    if (collectionMatch) {
      const teamId = decodeURIComponent(collectionMatch[1]);
      if (request.method === "GET") {
        const includeArchived = url.searchParams.get("include_archived") === "true";
        return Response.json(
          { plays: await listPlays(db, teamId, includeArchived) },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      if (request.method === "POST") {
        const body = await readJson(request);
        if (!body) return errorResponse("validation_error", "Request body must be a JSON object.", 400);
        const parsed = parsePlayInput(body);
        if (!parsed.input) return errorResponse("validation_error", "One or more fields are invalid.", 400, parsed.fields);
        return Response.json(await createPlay(db, teamId, parsed.input), {
          status: 201,
          headers: { "Cache-Control": "no-store" },
        });
      }
      return null;
    }

    const playMatch = pathname.match(/^\/api\/teams\/([^/]+)\/plays\/([^/]+)$/);
    if (!playMatch) return null;
    const teamId = decodeURIComponent(playMatch[1]);
    const playId = decodeURIComponent(playMatch[2]);

    if (request.method === "GET") {
      return Response.json(await getPlay(db, teamId, playId), { headers: { "Cache-Control": "no-store" } });
    }

    if (request.method === "PUT") {
      const body = await readJson(request);
      if (!body) return errorResponse("validation_error", "Request body must be a JSON object.", 400);
      const parsed = parsePlayInput(body);
      if (!parsed.input) return errorResponse("validation_error", "One or more fields are invalid.", 400, parsed.fields);
      return Response.json(await updatePlay(db, teamId, playId, parsed.input), { headers: { "Cache-Control": "no-store" } });
    }

    if (request.method === "PATCH") {
      const body = await readJson(request);
      if (!body || typeof body.archived !== "boolean") {
        return errorResponse("validation_error", "archived must be a boolean.", 400, { archived: "Must be a boolean" });
      }
      const current = await getPlay(db, teamId, playId);
      return Response.json(
        await updatePlay(db, teamId, playId, {
          name: current.name,
          side: current.side,
          formation_id: current.formation_id,
          formation: current.formation,
          notes: current.notes,
          diagram: current.diagram,
          archived: body.archived,
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return null;
  } catch (error) {
    if (error instanceof RepositoryError) {
      return errorResponse(error.code, error.message, error.code === "not_found" ? 404 : 409);
    }
    console.error("Unhandled playbook API error", error instanceof Error ? error.name : "unknown");
    return errorResponse("internal_error", "An unexpected error occurred.", 500);
  }
}

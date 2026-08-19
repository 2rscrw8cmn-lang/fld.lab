import type { D1Database } from "@cloudflare/workers-types";

import {
  AuthorizationError,
  addTeamCoach,
  authorizationErrorResponse,
  createOwnedTeam,
  listAccessibleTeams,
  listTeamCoaches,
  removeTeamCoach,
  roleForTeam,
  type AuthorizationContext,
} from "../authorization";
import { RepositoryError, updateTeam } from "../db/repository";

type JsonObject = Record<string, unknown>;

function errorResponse(code: string, message: string, status: number, fields?: Record<string, string>) {
  return Response.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status });
}

async function readJson(request: Request): Promise<JsonObject | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
  } catch {
    return null;
  }
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value.trim() || null : undefined;
}

export async function handleOwnershipApi(
  request: Request,
  db: D1Database,
  context: AuthorizationContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  try {
    if (pathname === "/api/teams" && request.method === "GET") {
      return Response.json({ teams: await listAccessibleTeams(db, context.coach.id) });
    }

    if (pathname === "/api/team-admin/teams" && request.method === "GET") {
      return Response.json({ teams: await listAccessibleTeams(db, context.coach.id, true) });
    }

    if (pathname === "/api/teams" && request.method === "POST") {
      const body = await readJson(request);
      if (!body) return errorResponse("validation_error", "Request body must be a JSON object.", 400);

      const name = requiredString(body.name);
      const ageGroup = optionalString(body.age_group);
      const seasonLabel = optionalString(body.season_label);
      const fields: Record<string, string> = {};
      if (!name) fields.name = "Required";
      if (body.age_group !== undefined && ageGroup === undefined) fields.age_group = "Must be a string or null";
      if (body.season_label !== undefined && seasonLabel === undefined) fields.season_label = "Must be a string or null";
      if (Object.keys(fields).length) return errorResponse("validation_error", "One or more fields are invalid.", 400, fields);

      return Response.json(
        await createOwnedTeam(db, context.coach.id, { name: name!, age_group: ageGroup, season_label: seasonLabel }),
        { status: 201 },
      );
    }

    const coachesMatch = pathname.match(/^\/api\/teams\/([^/]+)\/coaches$/);
    if (coachesMatch) {
      const teamId = decodeURIComponent(coachesMatch[1]);
      if (request.method === "GET") {
        return Response.json({ coaches: await listTeamCoaches(db, teamId) });
      }
      if (request.method === "POST") {
        const body = await readJson(request);
        if (!body) return errorResponse("validation_error", "Request body must be a JSON object.", 400);
        const email = requiredString(body.email);
        if (!email) return errorResponse("validation_error", "Coach email is required.", 400, { email: "Required" });
        return Response.json(
          await addTeamCoach(db, teamId, email, context.authorizedEmails),
          { status: 201 },
        );
      }
    }

    const coachMemberMatch = pathname.match(/^\/api\/teams\/([^/]+)\/coaches\/([^/]+)$/);
    if (coachMemberMatch && request.method === "DELETE") {
      await removeTeamCoach(
        db,
        decodeURIComponent(coachMemberMatch[1]),
        decodeURIComponent(coachMemberMatch[2]),
        context.coach.id,
      );
      return Response.json({ removed: true });
    }

    const teamMatch = pathname.match(/^\/api\/teams\/([^/]+)$/);
    if (teamMatch && request.method === "PATCH") {
      const teamId = decodeURIComponent(teamMatch[1]);
      const body = await readJson(request);
      if (!body) return errorResponse("validation_error", "Request body must be a JSON object.", 400);

      const patch: Parameters<typeof updateTeam>[2] = {};
      const fields: Record<string, string> = {};
      if (body.name !== undefined) {
        const name = requiredString(body.name);
        if (!name) fields.name = "Required";
        else patch.name = name;
      }
      if (body.age_group !== undefined) {
        const value = optionalString(body.age_group);
        if (value === undefined) fields.age_group = "Must be a string or null";
        else patch.age_group = value;
      }
      if (body.season_label !== undefined) {
        const value = optionalString(body.season_label);
        if (value === undefined) fields.season_label = "Must be a string or null";
        else patch.season_label = value;
      }
      if (body.active !== undefined) {
        if (typeof body.active !== "boolean") fields.active = "Must be a boolean";
        else patch.active = body.active;
      }
      if (Object.keys(fields).length) return errorResponse("validation_error", "One or more fields are invalid.", 400, fields);

      const team = await updateTeam(db, teamId, patch);
      return Response.json({ ...team, access_role: await roleForTeam(db, context.coach.id, teamId) });
    }

    return null;
  } catch (error) {
    if (error instanceof AuthorizationError) return authorizationErrorResponse(error);
    if (error instanceof RepositoryError) {
      return errorResponse(error.code, error.message, error.code === "not_found" ? 404 : 409);
    }
    console.error("Unhandled team ownership API error", error);
    return errorResponse("internal_error", "An unexpected error occurred.", 500);
  }
}

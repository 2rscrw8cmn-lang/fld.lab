import type { D1Database } from "@cloudflare/workers-types";

import {
  RepositoryError,
  addRosterMember,
  createTeam,
  getRoster,
  listTeams,
  updateAthlete,
  updateMembership,
  updateTeam,
} from "./db/repository";

export type Env = { DB: D1Database };

type JsonObject = Record<string, unknown>;

type ApiErrorCode = "validation_error" | "not_found" | "conflict" | "internal_error";

function errorResponse(code: ApiErrorCode, message: string, status: number, fields?: Record<string, string>) {
  return Response.json(
    { error: { code, message, ...(fields ? { fields } : {}) } },
    { status },
  );
}

async function readJson(request: Request): Promise<JsonObject | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
  } catch {
    return null;
  }
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value.trim() || null : undefined;
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalBirthYear(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1900 || value > new Date().getUTCFullYear()) {
    return undefined;
  }
  return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function isAthleteStatus(value: unknown): value is "active" | "inactive" {
  return value === "active" || value === "inactive";
}

function parseMembershipInput(value: unknown) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as JsonObject;
  const jersey_number = optionalString(object.jersey_number);
  const primary_position = optionalString(object.primary_position);
  const secondary_position = optionalString(object.secondary_position);

  if (
    (object.jersey_number !== undefined && jersey_number === undefined) ||
    (object.primary_position !== undefined && primary_position === undefined) ||
    (object.secondary_position !== undefined && secondary_position === undefined)
  ) {
    return null;
  }

  return { jersey_number, primary_position, secondary_position };
}

function routeId(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const remainder = pathname.slice(prefix.length);
  return remainder && !remainder.includes("/") ? decodeURIComponent(remainder) : null;
}

export async function handleApi(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  try {
    if (pathname === "/api/teams" && request.method === "GET") {
      return Response.json({ teams: await listTeams(env.DB) });
    }

    if (pathname === "/api/teams" && request.method === "POST") {
      const body = await readJson(request);
      if (!body) return errorResponse("validation_error", "Request body must be a JSON object.", 400);

      const name = requiredString(body.name);
      const age_group = optionalString(body.age_group);
      const season_label = optionalString(body.season_label);
      const fields: Record<string, string> = {};
      if (!name) fields.name = "Required";
      if (body.age_group !== undefined && age_group === undefined) fields.age_group = "Must be a string or null";
      if (body.season_label !== undefined && season_label === undefined) fields.season_label = "Must be a string or null";
      if (Object.keys(fields).length) return errorResponse("validation_error", "One or more fields are invalid.", 400, fields);

      const team = await createTeam(env.DB, { name: name!, age_group, season_label });
      return Response.json(team, { status: 201 });
    }

    const teamId = routeId(pathname, "/api/teams/");
    if (teamId && request.method === "PATCH") {
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
        const value = optionalBoolean(body.active);
        if (value === undefined) fields.active = "Must be a boolean";
        else patch.active = value;
      }
      if (Object.keys(fields).length) return errorResponse("validation_error", "One or more fields are invalid.", 400, fields);

      return Response.json(await updateTeam(env.DB, teamId, patch));
    }

    const rosterMatch = pathname.match(/^\/api\/teams\/([^/]+)\/roster$/);
    if (rosterMatch) {
      const rosterTeamId = decodeURIComponent(rosterMatch[1]);

      if (request.method === "GET") {
        const includeInactive = url.searchParams.get("include_inactive") === "true";
        return Response.json({ team_id: rosterTeamId, roster: await getRoster(env.DB, rosterTeamId, includeInactive) });
      }

      if (request.method === "POST") {
        const body = await readJson(request);
        if (!body) return errorResponse("validation_error", "Request body must be a JSON object.", 400);
        const membership = parseMembershipInput(body.membership);
        if (!membership) {
          return errorResponse("validation_error", "One or more fields are invalid.", 400, {
            membership: "Membership fields must be strings or null",
          });
        }

        const athleteId = requiredString(body.athlete_id);
        const athleteObject = body.athlete && typeof body.athlete === "object" && !Array.isArray(body.athlete)
          ? (body.athlete as JsonObject)
          : null;

        if ((athleteId && athleteObject) || (!athleteId && !athleteObject)) {
          return errorResponse("validation_error", "Provide exactly one of athlete or athlete_id.", 400);
        }

        if (athleteId) {
          const row = await addRosterMember(env.DB, rosterTeamId, { athlete_id: athleteId, membership });
          return Response.json(row, { status: 201 });
        }

        const first_name = requiredString(athleteObject!.first_name);
        const last_name = requiredString(athleteObject!.last_name);
        const birth_year = optionalBirthYear(athleteObject!.birth_year);
        const notes = optionalString(athleteObject!.notes);
        const fields: Record<string, string> = {};
        if (!first_name) fields.first_name = "Required";
        if (!last_name) fields.last_name = "Required";
        if (athleteObject!.birth_year !== undefined && birth_year === undefined) fields.birth_year = "Must be a valid year or null";
        if (athleteObject!.notes !== undefined && notes === undefined) fields.notes = "Must be a string or null";
        if (Object.keys(fields).length) return errorResponse("validation_error", "One or more fields are invalid.", 400, fields);

        const row = await addRosterMember(env.DB, rosterTeamId, {
          athlete: { first_name: first_name!, last_name: last_name!, birth_year, notes },
          membership,
        });
        return Response.json(row, { status: 201 });
      }
    }

    const athleteId = routeId(pathname, "/api/athletes/");
    if (athleteId && request.method === "PATCH") {
      const body = await readJson(request);
      if (!body) return errorResponse("validation_error", "Request body must be a JSON object.", 400);

      const patch: Parameters<typeof updateAthlete>[2] = {};
      const fields: Record<string, string> = {};
      if (body.first_name !== undefined) {
        const value = requiredString(body.first_name);
        if (!value) fields.first_name = "Required";
        else patch.first_name = value;
      }
      if (body.last_name !== undefined) {
        const value = requiredString(body.last_name);
        if (!value) fields.last_name = "Required";
        else patch.last_name = value;
      }
      if (body.birth_year !== undefined) {
        const value = optionalBirthYear(body.birth_year);
        if (value === undefined) fields.birth_year = "Must be a valid year or null";
        else patch.birth_year = value;
      }
      if (body.status !== undefined) {
        if (!isAthleteStatus(body.status)) fields.status = "Must be active or inactive";
        else patch.status = body.status;
      }
      if (body.notes !== undefined) {
        const value = optionalString(body.notes);
        if (value === undefined) fields.notes = "Must be a string or null";
        else patch.notes = value;
      }
      if (Object.keys(fields).length) return errorResponse("validation_error", "One or more fields are invalid.", 400, fields);

      return Response.json(await updateAthlete(env.DB, athleteId, patch));
    }

    const membershipId = routeId(pathname, "/api/team-memberships/");
    if (membershipId && request.method === "PATCH") {
      const body = await readJson(request);
      if (!body) return errorResponse("validation_error", "Request body must be a JSON object.", 400);

      const patch: Parameters<typeof updateMembership>[2] = {};
      const fields: Record<string, string> = {};
      for (const key of ["jersey_number", "primary_position", "secondary_position"] as const) {
        if (body[key] !== undefined) {
          const value = optionalString(body[key]);
          if (value === undefined) fields[key] = "Must be a string or null";
          else patch[key] = value;
        }
      }
      if (body.active !== undefined) {
        const value = optionalBoolean(body.active);
        if (value === undefined) fields.active = "Must be a boolean";
        else patch.active = value;
      }
      if (Object.keys(fields).length) return errorResponse("validation_error", "One or more fields are invalid.", 400, fields);

      return Response.json(await updateMembership(env.DB, membershipId, patch));
    }

    return null;
  } catch (error) {
    if (error instanceof RepositoryError) {
      return errorResponse(error.code, error.message, error.code === "not_found" ? 404 : 409);
    }
    console.error("Unhandled API error", error);
    return errorResponse("internal_error", "An unexpected error occurred.", 500);
  }
}

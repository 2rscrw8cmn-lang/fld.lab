import type { D1Database } from "@cloudflare/workers-types";

import { getSessionResultContext, getTeamDrillTrend, listTeamSessions } from "../db/history";
import { getAthleteResults, getDrillLeaderboard } from "../db/results";
import { RepositoryError } from "../db/repository";

function errorResponse(code: string, message: string, status: number, fields?: Record<string, string>) {
  return Response.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status });
}

function optionalDate(value: string | null, field: string, fields: Record<string, string>) {
  if (!value) return undefined;
  if (Number.isNaN(Date.parse(value))) {
    fields[field] = "Must be an ISO-8601 date or timestamp";
    return undefined;
  }
  return new Date(value).toISOString();
}

export async function handleResultsApi(request: Request, db: D1Database): Promise<Response | null> {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  const { pathname, searchParams } = url;

  try {
    const athleteMatch = pathname.match(/^\/api\/athletes\/([^/]+)\/results$/);
    if (athleteMatch) {
      const fields: Record<string, string> = {};
      const from = optionalDate(searchParams.get("from"), "from", fields);
      const to = optionalDate(searchParams.get("to"), "to", fields);
      if (Object.keys(fields).length) return errorResponse("validation_error", "One or more filters are invalid.", 400, fields);
      if (from && to && from > to) {
        return errorResponse("validation_error", "from must be before to.", 400, { from: "Must be before to" });
      }
      return Response.json(
        await getAthleteResults(db, decodeURIComponent(athleteMatch[1]), {
          teamId: searchParams.get("team_id") || undefined,
          drillId: searchParams.get("drill_id") || undefined,
          from,
          to,
        }),
      );
    }

    const leaderboardMatch = pathname.match(/^\/api\/drills\/([^/]+)\/leaderboard$/);
    if (leaderboardMatch) {
      const teamId = searchParams.get("team_id")?.trim();
      if (!teamId) return errorResponse("validation_error", "team_id is required.", 400, { team_id: "Required" });
      return Response.json(await getDrillLeaderboard(db, decodeURIComponent(leaderboardMatch[1]), teamId));
    }

    const teamSessionsMatch = pathname.match(/^\/api\/teams\/([^/]+)\/sessions$/);
    if (teamSessionsMatch) {
      const rawLimit = searchParams.get("limit");
      const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 12;
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
        return errorResponse("validation_error", "limit must be an integer between 1 and 50.", 400, { limit: "Invalid limit" });
      }
      return Response.json({ sessions: await listTeamSessions(db, decodeURIComponent(teamSessionsMatch[1]), parsedLimit) });
    }

    const teamTrendMatch = pathname.match(/^\/api\/teams\/([^/]+)\/drills\/([^/]+)\/trend$/);
    if (teamTrendMatch) {
      return Response.json(
        await getTeamDrillTrend(
          db,
          decodeURIComponent(teamTrendMatch[1]),
          decodeURIComponent(teamTrendMatch[2]),
        ),
      );
    }

    const sessionContextMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/result-context$/);
    if (sessionContextMatch) {
      return Response.json(await getSessionResultContext(db, decodeURIComponent(sessionContextMatch[1])));
    }

    return null;
  } catch (error) {
    if (error instanceof RepositoryError) {
      return errorResponse(error.code, error.message, error.code === "not_found" ? 404 : 409);
    }
    console.error("Unhandled results API error", error);
    return errorResponse("internal_error", "An unexpected error occurred.", 500);
  }
}

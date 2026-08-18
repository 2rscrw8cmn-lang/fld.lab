import type { D1Database } from "@cloudflare/workers-types";

type TeamDbRow = {
  id: string;
  name: string;
  age_group: string | null;
  season_label: string | null;
  active: number;
  created_at: string;
  updated_at: string;
};

export async function handleTeamAdminApi(request: Request, db: D1Database): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== "/api/team-admin/teams") return null;

  const result = await db
    .prepare("SELECT * FROM teams ORDER BY active DESC, name, season_label")
    .all<TeamDbRow>();

  return Response.json({
    teams: result.results.map((team) => ({ ...team, active: team.active === 1 })),
  });
}

import { apiRequest, type Team } from "@/lib/api";

export async function listAllTeams(): Promise<Team[]> {
  const data = await apiRequest<{ teams: Team[] }>("/api/team-admin/teams");
  return data.teams;
}

export async function patchTeam(
  teamId: string,
  patch: Partial<Pick<Team, "name" | "age_group" | "season_label" | "active">>,
): Promise<Team> {
  return apiRequest<Team>(`/api/teams/${encodeURIComponent(teamId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

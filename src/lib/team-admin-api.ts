import { apiRequest, type Team } from "@/lib/api";

export type TeamCoach = {
  id: string;
  email: string;
  display_name: string | null;
  role: "owner" | "coach";
};

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

export async function listTeamCoaches(teamId: string): Promise<TeamCoach[]> {
  const data = await apiRequest<{ coaches: TeamCoach[] }>(`/api/teams/${encodeURIComponent(teamId)}/coaches`);
  return data.coaches;
}

export async function addTeamCoach(teamId: string, email: string): Promise<TeamCoach> {
  return apiRequest<TeamCoach>(`/api/teams/${encodeURIComponent(teamId)}/coaches`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function removeTeamCoach(teamId: string, coachId: string): Promise<void> {
  await apiRequest<unknown>(`/api/teams/${encodeURIComponent(teamId)}/coaches/${encodeURIComponent(coachId)}`, {
    method: "DELETE",
  });
}

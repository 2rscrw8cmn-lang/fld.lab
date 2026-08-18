import { ApiError, type Team } from "@/lib/api";

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    let message = "Request failed.";
    let fields: Record<string, string> | undefined;
    try {
      const body = await response.json() as { error?: { message?: string; fields?: Record<string, string> } };
      message = body.error?.message ?? message;
      fields = body.error?.fields;
    } catch {
      // Keep generic fallback for non-JSON failures.
    }
    throw new ApiError(message, response.status, fields);
  }

  return response.json() as Promise<T>;
}

export async function listAllTeams(): Promise<Team[]> {
  const data = await request<{ teams: Team[] }>("/api/team-admin/teams");
  return data.teams;
}

export async function patchTeam(
  teamId: string,
  patch: Partial<Pick<Team, "name" | "age_group" | "season_label" | "active">>,
): Promise<Team> {
  return request<Team>(`/api/teams/${encodeURIComponent(teamId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

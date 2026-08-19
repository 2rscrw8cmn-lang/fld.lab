import { apiRequest } from "@/lib/api";
import type { PlaybookFormat } from "@/features/playbook/playbook-context";

export type StoredPlaybook = {
  id: string;
  team_id: string;
  name: string;
  format: PlaybookFormat;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export async function listTeamPlaybooks(teamId: string, includeArchived = false): Promise<StoredPlaybook[]> {
  const suffix = includeArchived ? "?include_archived=true" : "";
  const data = await apiRequest<{ playbooks: StoredPlaybook[] }>(`/api/teams/${encodeURIComponent(teamId)}/playbooks${suffix}`);
  return data.playbooks;
}

export async function createTeamPlaybook(
  teamId: string,
  input: { name: string; format: PlaybookFormat },
): Promise<StoredPlaybook> {
  return apiRequest<StoredPlaybook>(`/api/teams/${encodeURIComponent(teamId)}/playbooks`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTeamPlaybook(
  teamId: string,
  playbookId: string,
  patch: { name?: string; archived?: boolean },
): Promise<StoredPlaybook> {
  return apiRequest<StoredPlaybook>(`/api/teams/${encodeURIComponent(teamId)}/playbooks/${encodeURIComponent(playbookId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

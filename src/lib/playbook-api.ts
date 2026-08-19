import { getActivePlaybookContext } from "@/features/playbook/playbook-context";
import { apiRequest } from "@/lib/api";

export type PlayType = "pass" | "run" | "option";
export type PlaySituation = "any" | "short" | "medium" | "deep" | "no-run" | "goal-line" | "conversion";

export type StoredPlay = {
  id: string;
  team_id: string;
  playbook_id: string;
  name: string;
  side: "offense" | "defense";
  formation_id: string | null;
  formation: string;
  play_type: PlayType;
  concept: string;
  situation: PlaySituation;
  active_play: boolean;
  notes: string;
  diagram: unknown;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type PlayInput = {
  name: string;
  side: "offense" | "defense";
  formation_id: string | null;
  formation: string;
  play_type: PlayType;
  concept: string;
  situation: PlaySituation;
  active_play: boolean;
  notes: string;
  diagram: unknown;
};

function activePlaybookId() {
  const playbookId = getActivePlaybookContext()?.id;
  if (!playbookId) throw new Error("Select a playbook before loading plays.");
  return playbookId;
}

function requestInput(input: PlayInput) {
  return { ...input, playbook_id: activePlaybookId() };
}

export async function listTeamPlays(teamId: string, includeArchived = false): Promise<StoredPlay[]> {
  const params = new URLSearchParams({ playbook_id: activePlaybookId() });
  if (includeArchived) params.set("include_archived", "true");
  const data = await apiRequest<{ plays: StoredPlay[] }>(`/api/teams/${encodeURIComponent(teamId)}/plays?${params.toString()}`);
  return data.plays;
}

export async function createTeamPlay(teamId: string, input: PlayInput): Promise<StoredPlay> {
  return apiRequest<StoredPlay>(`/api/teams/${encodeURIComponent(teamId)}/plays`, {
    method: "POST",
    body: JSON.stringify(requestInput(input)),
  });
}

export async function updateTeamPlay(teamId: string, playId: string, input: PlayInput): Promise<StoredPlay> {
  return apiRequest<StoredPlay>(`/api/teams/${encodeURIComponent(teamId)}/plays/${encodeURIComponent(playId)}`, {
    method: "PUT",
    body: JSON.stringify(requestInput(input)),
  });
}

export async function setTeamPlayArchived(teamId: string, playId: string, archived: boolean): Promise<StoredPlay> {
  return apiRequest<StoredPlay>(`/api/teams/${encodeURIComponent(teamId)}/plays/${encodeURIComponent(playId)}`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
}

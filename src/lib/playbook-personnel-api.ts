import { apiRequest } from "@/lib/api";

export type PlayPersonnelAssignment = {
  player_id: string;
  athlete_id: string;
  athlete: {
    id: string;
    first_name: string;
    last_name: string;
  };
  membership: {
    jersey_number: string | null;
    primary_position: string | null;
    secondary_position: string | null;
  };
};

export type PlayPersonnelInput = {
  player_id: string;
  athlete_id: string;
};

export async function getPlayPersonnel(teamId: string, playId: string): Promise<PlayPersonnelAssignment[]> {
  const data = await apiRequest<{ personnel: PlayPersonnelAssignment[] }>(
    `/api/teams/${encodeURIComponent(teamId)}/plays/${encodeURIComponent(playId)}/personnel`,
  );
  return data.personnel;
}

export async function replacePlayPersonnel(
  teamId: string,
  playId: string,
  assignments: PlayPersonnelInput[],
): Promise<PlayPersonnelAssignment[]> {
  const data = await apiRequest<{ personnel: PlayPersonnelAssignment[] }>(
    `/api/teams/${encodeURIComponent(teamId)}/plays/${encodeURIComponent(playId)}/personnel`,
    {
      method: "PUT",
      body: JSON.stringify({ assignments }),
    },
  );
  return data.personnel;
}

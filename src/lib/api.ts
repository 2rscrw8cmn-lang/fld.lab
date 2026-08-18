export type Team = {
  id: string;
  name: string;
  age_group: string | null;
  season_label: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Athlete = {
  id: string;
  first_name: string;
  last_name: string;
  birth_year: number | null;
  status: "active" | "inactive";
  notes: string | null;
};

export type TeamMembership = {
  id: string;
  team_id: string;
  athlete_id?: string;
  jersey_number: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  active: boolean;
};

export type RosterRow = {
  athlete: Athlete;
  membership: TeamMembership;
};

export type MeasurementType =
  | "time"
  | "successes_attempts"
  | "distance"
  | "count"
  | "rating"
  | "custom_numeric";

export type DrillDefinition = {
  schema_version: 1;
  slug: string;
  name: string;
  category: string;
  icon?: string;
  description?: string;
  instructions?: string;
  measurement: {
    type: MeasurementType;
    direction: "lower" | "higher" | "none";
    unit?: string;
    total_attempts?: number;
    min?: number;
    max?: number;
    step?: number;
    fields?: Array<{ key: string; label: string; unit: string }>;
  };
  attempts: {
    count: number;
    result: "best" | "average" | "latest" | "total";
  };
  timer?: {
    enabled: boolean;
    splits: Array<{ key: string; label: string }>;
  };
  equipment?: string[];
  tags?: string[];
  positions?: string[];
  setup?: {
    distance_yards?: number;
    notes?: string;
  };
};

export type Drill = {
  id: string;
  slug: string;
  name: string;
  category: string;
  icon: string | null;
  measurement_type: MeasurementType;
  active: boolean;
  current_version_id: string;
  current_version: number;
  created_at: string;
  updated_at: string;
};

export type DrillDetail = {
  drill: Drill;
  version: {
    id: string;
    drill_id: string;
    version: number;
    definition: DrillDefinition;
    created_at: string;
  };
};

export type DrillImportResult = DrillDetail & {
  created: boolean;
  version_created: boolean;
};

export class ApiError extends Error {
  constructor(message: string, public status: number, public fields?: Record<string, string>) {
    super(message);
  }
}

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
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
      // Keep the generic message when the server did not return JSON.
    }
    throw new ApiError(message, response.status, fields);
  }

  return response.json() as Promise<T>;
}

export async function listTeams(): Promise<Team[]> {
  const data = await api<{ teams: Team[] }>("/api/teams");
  return data.teams;
}

export async function createTeam(input: { name: string; age_group: string | null; season_label: string | null }): Promise<Team> {
  return api<Team>("/api/teams", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getRoster(teamId: string, includeInactive = false): Promise<RosterRow[]> {
  const suffix = includeInactive ? "?include_inactive=true" : "";
  const data = await api<{ roster: RosterRow[] }>(`/api/teams/${encodeURIComponent(teamId)}/roster${suffix}`);
  return data.roster;
}

export type AthleteFormInput = {
  first_name: string;
  last_name: string;
  birth_year: number | null;
  notes: string | null;
};

export type MembershipFormInput = {
  jersey_number: string | null;
  primary_position: string | null;
  secondary_position: string | null;
};

export async function createRosterMember(teamId: string, athlete: AthleteFormInput, membership: MembershipFormInput) {
  return api<RosterRow>(`/api/teams/${encodeURIComponent(teamId)}/roster`, {
    method: "POST",
    body: JSON.stringify({ athlete, membership }),
  });
}

export async function patchAthlete(athleteId: string, patch: Partial<AthleteFormInput> & { status?: "active" | "inactive" }) {
  return api<Athlete>(`/api/athletes/${encodeURIComponent(athleteId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function patchMembership(
  membershipId: string,
  patch: Partial<MembershipFormInput> & { active?: boolean },
) {
  return api<TeamMembership>(`/api/team-memberships/${encodeURIComponent(membershipId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function listDrills(): Promise<Drill[]> {
  const data = await api<{ drills: Drill[] }>("/api/drills");
  return data.drills;
}

export async function getDrill(drillId: string): Promise<DrillDetail> {
  return api<DrillDetail>(`/api/drills/${encodeURIComponent(drillId)}`);
}

export async function importDrill(definition: unknown): Promise<DrillImportResult> {
  return api<DrillImportResult>("/api/drills/import", {
    method: "POST",
    body: JSON.stringify(definition),
  });
}

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

export type TrainingSession = {
  id: string;
  team_id: string;
  drill_id: string;
  drill_version_id: string;
  started_at: string;
  completed_at: string | null;
  status: "active" | "completed" | "abandoned";
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionAthlete = {
  id: string;
  session_id: string;
  athlete_id: string;
  order_index: number;
  status: "pending" | "active" | "complete" | "skipped";
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

export type AttemptMeasurement = {
  id?: string;
  attempt_id?: string;
  key: string;
  label: string;
  value_numeric: number | null;
  value_text?: string | null;
  unit: string | null;
  sequence: number;
  created_at?: string;
};

export type PersistedAttempt = {
  id: string;
  client_attempt_id: string;
  session_id: string;
  athlete_id: string;
  attempt_number: number;
  started_at: string | null;
  stopped_at: string | null;
  elapsed_ms: number | null;
  valid: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
  measurements: AttemptMeasurement[];
};

export type SessionDetail = {
  session: TrainingSession;
  drill_definition: DrillDefinition;
  athletes: SessionAthlete[];
  attempts: PersistedAttempt[];
};

export type AttemptPayload = {
  client_attempt_id: string;
  athlete_id: string;
  attempt_number: number;
  started_at: string | null;
  stopped_at: string | null;
  elapsed_ms: number | null;
  valid: boolean;
  note: string | null;
  measurements: AttemptMeasurement[];
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

export async function getActiveSession(teamId: string): Promise<SessionDetail | null> {
  const data = await api<{ session: SessionDetail | null }>(`/api/teams/${encodeURIComponent(teamId)}/active-session`);
  return data.session;
}

export async function createTrainingSession(teamId: string, drillId: string): Promise<SessionDetail> {
  return api<SessionDetail>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ team_id: teamId, drill_id: drillId }),
  });
}

export async function getTrainingSession(sessionId: string): Promise<SessionDetail> {
  return api<SessionDetail>(`/api/sessions/${encodeURIComponent(sessionId)}`);
}

export async function persistTrainingAttempt(sessionId: string, payload: AttemptPayload): Promise<PersistedAttempt> {
  return api<PersistedAttempt>(`/api/sessions/${encodeURIComponent(sessionId)}/attempts`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchSessionAthlete(
  sessionId: string,
  athleteId: string,
  status: "skipped" | "pending",
): Promise<{ athlete_id: string; status: SessionAthlete["status"] }> {
  return api<{ athlete_id: string; status: SessionAthlete["status"] }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/athletes/${encodeURIComponent(athleteId)}`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
}

export async function patchTrainingSession(
  sessionId: string,
  status: "completed" | "abandoned",
): Promise<TrainingSession> {
  return api<TrainingSession>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

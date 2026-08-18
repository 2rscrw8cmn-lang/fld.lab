import type { D1Database } from "@cloudflare/workers-types";

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
  created_at: string;
  updated_at: string;
};

export type TeamMembership = {
  id: string;
  team_id: string;
  athlete_id: string;
  jersey_number: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  joined_at: string;
  left_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type RosterRow = {
  athlete: Athlete;
  membership: TeamMembership;
};

type TeamDbRow = Omit<Team, "active"> & { active: number };
type MembershipDbRow = Omit<TeamMembership, "active"> & { active: number };

export class RepositoryError extends Error {
  constructor(
    public readonly code: "not_found" | "conflict",
    message: string,
  ) {
    super(message);
  }
}

const nowIso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function teamFromRow(row: TeamDbRow): Team {
  return { ...row, active: row.active === 1 };
}

function membershipFromRow(row: MembershipDbRow): TeamMembership {
  return { ...row, active: row.active === 1 };
}

async function requireTeam(db: D1Database, teamId: string): Promise<Team> {
  const row = await db.prepare("SELECT * FROM teams WHERE id = ?").bind(teamId).first<TeamDbRow>();
  if (!row) throw new RepositoryError("not_found", "Team not found.");
  return teamFromRow(row);
}

async function requireAthlete(db: D1Database, athleteId: string): Promise<Athlete> {
  const row = await db.prepare("SELECT * FROM athletes WHERE id = ?").bind(athleteId).first<Athlete>();
  if (!row) throw new RepositoryError("not_found", "Athlete not found.");
  return row;
}

async function requireMembership(db: D1Database, membershipId: string): Promise<TeamMembership> {
  const row = await db
    .prepare("SELECT * FROM team_memberships WHERE id = ?")
    .bind(membershipId)
    .first<MembershipDbRow>();
  if (!row) throw new RepositoryError("not_found", "Team membership not found.");
  return membershipFromRow(row);
}

async function ensureMembershipAvailable(db: D1Database, teamId: string, athleteId: string) {
  const existing = await db
    .prepare("SELECT id FROM team_memberships WHERE team_id = ? AND athlete_id = ?")
    .bind(teamId, athleteId)
    .first<{ id: string }>();
  if (existing) throw new RepositoryError("conflict", "Athlete is already a member of this team.");
}

export async function listTeams(db: D1Database): Promise<Team[]> {
  const result = await db.prepare("SELECT * FROM teams WHERE active = 1 ORDER BY name, season_label").all<TeamDbRow>();
  return result.results.map(teamFromRow);
}

export async function createTeam(
  db: D1Database,
  input: { name: string; age_group?: string | null; season_label?: string | null },
): Promise<Team> {
  const timestamp = nowIso();
  const team: Team = {
    id: id("team"),
    name: input.name,
    age_group: input.age_group ?? null,
    season_label: input.season_label ?? null,
    active: true,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await db
    .prepare(
      "INSERT INTO teams (id, name, age_group, season_label, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
    )
    .bind(team.id, team.name, team.age_group, team.season_label, team.created_at, team.updated_at)
    .run();

  return team;
}

export async function updateTeam(
  db: D1Database,
  teamId: string,
  patch: Partial<Pick<Team, "name" | "age_group" | "season_label" | "active">>,
): Promise<Team> {
  const current = await requireTeam(db, teamId);
  const updated: Team = {
    ...current,
    ...patch,
    updated_at: nowIso(),
  };

  await db
    .prepare("UPDATE teams SET name = ?, age_group = ?, season_label = ?, active = ?, updated_at = ? WHERE id = ?")
    .bind(updated.name, updated.age_group, updated.season_label, updated.active ? 1 : 0, updated.updated_at, teamId)
    .run();

  return updated;
}

export async function getRoster(db: D1Database, teamId: string, includeInactive = false): Promise<RosterRow[]> {
  await requireTeam(db, teamId);

  const result = await db
    .prepare(
      `SELECT
        a.id AS athlete_id,
        a.first_name,
        a.last_name,
        a.birth_year,
        a.status,
        a.notes,
        a.created_at AS athlete_created_at,
        a.updated_at AS athlete_updated_at,
        m.id AS membership_id,
        m.team_id,
        m.jersey_number,
        m.primary_position,
        m.secondary_position,
        m.joined_at,
        m.left_at,
        m.active AS membership_active,
        m.created_at AS membership_created_at,
        m.updated_at AS membership_updated_at
      FROM team_memberships m
      JOIN athletes a ON a.id = m.athlete_id
      WHERE m.team_id = ? AND (? = 1 OR m.active = 1)
      ORDER BY
        CASE WHEN m.jersey_number GLOB '[0-9]*' THEN CAST(m.jersey_number AS INTEGER) ELSE 999999 END,
        a.last_name,
        a.first_name`,
    )
    .bind(teamId, includeInactive ? 1 : 0)
    .all<{
      athlete_id: string;
      first_name: string;
      last_name: string;
      birth_year: number | null;
      status: "active" | "inactive";
      notes: string | null;
      athlete_created_at: string;
      athlete_updated_at: string;
      membership_id: string;
      team_id: string;
      jersey_number: string | null;
      primary_position: string | null;
      secondary_position: string | null;
      joined_at: string;
      left_at: string | null;
      membership_active: number;
      membership_created_at: string;
      membership_updated_at: string;
    }>();

  return result.results.map((row) => ({
    athlete: {
      id: row.athlete_id,
      first_name: row.first_name,
      last_name: row.last_name,
      birth_year: row.birth_year,
      status: row.status,
      notes: row.notes,
      created_at: row.athlete_created_at,
      updated_at: row.athlete_updated_at,
    },
    membership: {
      id: row.membership_id,
      team_id: row.team_id,
      athlete_id: row.athlete_id,
      jersey_number: row.jersey_number,
      primary_position: row.primary_position,
      secondary_position: row.secondary_position,
      joined_at: row.joined_at,
      left_at: row.left_at,
      active: row.membership_active === 1,
      created_at: row.membership_created_at,
      updated_at: row.membership_updated_at,
    },
  }));
}

export async function addRosterMember(
  db: D1Database,
  teamId: string,
  input:
    | {
        athlete: { first_name: string; last_name: string; birth_year?: number | null; notes?: string | null };
        membership?: { jersey_number?: string | null; primary_position?: string | null; secondary_position?: string | null };
      }
    | {
        athlete_id: string;
        membership?: { jersey_number?: string | null; primary_position?: string | null; secondary_position?: string | null };
      },
): Promise<RosterRow> {
  await requireTeam(db, teamId);
  const timestamp = nowIso();
  const membershipInput = input.membership ?? {};

  if ("athlete_id" in input) {
    const athlete = await requireAthlete(db, input.athlete_id);
    await ensureMembershipAvailable(db, teamId, athlete.id);

    const membership: TeamMembership = {
      id: id("membership"),
      team_id: teamId,
      athlete_id: athlete.id,
      jersey_number: membershipInput.jersey_number ?? null,
      primary_position: membershipInput.primary_position ?? null,
      secondary_position: membershipInput.secondary_position ?? null,
      joined_at: timestamp,
      left_at: null,
      active: true,
      created_at: timestamp,
      updated_at: timestamp,
    };

    await db
      .prepare(
        `INSERT INTO team_memberships
          (id, team_id, athlete_id, jersey_number, primary_position, secondary_position, joined_at, left_at, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)`,
      )
      .bind(
        membership.id,
        membership.team_id,
        membership.athlete_id,
        membership.jersey_number,
        membership.primary_position,
        membership.secondary_position,
        membership.joined_at,
        membership.created_at,
        membership.updated_at,
      )
      .run();

    return { athlete, membership };
  }

  const athlete: Athlete = {
    id: id("athlete"),
    first_name: input.athlete.first_name,
    last_name: input.athlete.last_name,
    birth_year: input.athlete.birth_year ?? null,
    status: "active",
    notes: input.athlete.notes ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  };
  const membership: TeamMembership = {
    id: id("membership"),
    team_id: teamId,
    athlete_id: athlete.id,
    jersey_number: membershipInput.jersey_number ?? null,
    primary_position: membershipInput.primary_position ?? null,
    secondary_position: membershipInput.secondary_position ?? null,
    joined_at: timestamp,
    left_at: null,
    active: true,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await db.batch([
    db
      .prepare(
        "INSERT INTO athletes (id, first_name, last_name, birth_year, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)",
      )
      .bind(
        athlete.id,
        athlete.first_name,
        athlete.last_name,
        athlete.birth_year,
        athlete.notes,
        athlete.created_at,
        athlete.updated_at,
      ),
    db
      .prepare(
        `INSERT INTO team_memberships
          (id, team_id, athlete_id, jersey_number, primary_position, secondary_position, joined_at, left_at, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)`,
      )
      .bind(
        membership.id,
        membership.team_id,
        membership.athlete_id,
        membership.jersey_number,
        membership.primary_position,
        membership.secondary_position,
        membership.joined_at,
        membership.created_at,
        membership.updated_at,
      ),
  ]);

  return { athlete, membership };
}

export async function updateAthlete(
  db: D1Database,
  athleteId: string,
  patch: Partial<Pick<Athlete, "first_name" | "last_name" | "birth_year" | "status" | "notes">>,
): Promise<Athlete> {
  const current = await requireAthlete(db, athleteId);
  const updated: Athlete = { ...current, ...patch, updated_at: nowIso() };

  await db
    .prepare(
      "UPDATE athletes SET first_name = ?, last_name = ?, birth_year = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      updated.first_name,
      updated.last_name,
      updated.birth_year,
      updated.status,
      updated.notes,
      updated.updated_at,
      athleteId,
    )
    .run();

  return updated;
}

export async function updateMembership(
  db: D1Database,
  membershipId: string,
  patch: Partial<Pick<TeamMembership, "jersey_number" | "primary_position" | "secondary_position" | "active">>,
): Promise<TeamMembership> {
  const current = await requireMembership(db, membershipId);
  const nextActive = patch.active ?? current.active;
  const updated: TeamMembership = {
    ...current,
    ...patch,
    active: nextActive,
    left_at: nextActive ? null : current.left_at ?? nowIso(),
    updated_at: nowIso(),
  };

  await db
    .prepare(
      `UPDATE team_memberships
       SET jersey_number = ?, primary_position = ?, secondary_position = ?, active = ?, left_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      updated.jersey_number,
      updated.primary_position,
      updated.secondary_position,
      updated.active ? 1 : 0,
      updated.left_at,
      updated.updated_at,
      membershipId,
    )
    .run();

  return updated;
}

import type { D1Database } from "@cloudflare/workers-types";

import { RepositoryError } from "./repository";

export type PersonnelInput = {
  player_id: string;
  athlete_id: string;
};

export type StoredPersonnelAssignment = PersonnelInput & {
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

type PersonnelRow = {
  player_id: string;
  athlete_id: string;
  first_name: string;
  last_name: string;
  jersey_number: string | null;
  primary_position: string | null;
  secondary_position: string | null;
};

const nowIso = () => new Date().toISOString();

async function requirePlay(db: D1Database, teamId: string, playId: string) {
  const row = await db
    .prepare("SELECT id FROM plays WHERE id = ? AND team_id = ? AND archived = 0")
    .bind(playId, teamId)
    .first<{ id: string }>();
  if (!row) throw new RepositoryError("not_found", "Play not found.");
}

export async function listPlayPersonnel(
  db: D1Database,
  teamId: string,
  playId: string,
): Promise<StoredPersonnelAssignment[]> {
  await requirePlay(db, teamId, playId);
  const result = await db
    .prepare(
      `SELECT
         pp.player_id,
         pp.athlete_id,
         a.first_name,
         a.last_name,
         tm.jersey_number,
         tm.primary_position,
         tm.secondary_position
       FROM play_personnel pp
       JOIN athletes a ON a.id = pp.athlete_id
       JOIN team_memberships tm
         ON tm.athlete_id = pp.athlete_id
        AND tm.team_id = ?
        AND tm.active = 1
       WHERE pp.play_id = ?
       ORDER BY pp.player_id`,
    )
    .bind(teamId, playId)
    .all<PersonnelRow>();

  return result.results.map((row) => ({
    player_id: row.player_id,
    athlete_id: row.athlete_id,
    athlete: {
      id: row.athlete_id,
      first_name: row.first_name,
      last_name: row.last_name,
    },
    membership: {
      jersey_number: row.jersey_number,
      primary_position: row.primary_position,
      secondary_position: row.secondary_position,
    },
  }));
}

export async function replacePlayPersonnel(
  db: D1Database,
  teamId: string,
  playId: string,
  assignments: PersonnelInput[],
): Promise<StoredPersonnelAssignment[]> {
  await requirePlay(db, teamId, playId);

  if (assignments.length) {
    const athleteIds = assignments.map((assignment) => assignment.athlete_id);
    const placeholders = athleteIds.map(() => "?").join(", ");
    const result = await db
      .prepare(
        `SELECT athlete_id
         FROM team_memberships
         WHERE team_id = ? AND active = 1 AND athlete_id IN (${placeholders})`,
      )
      .bind(teamId, ...athleteIds)
      .all<{ athlete_id: string }>();
    const available = new Set(result.results.map((row) => row.athlete_id));
    if (athleteIds.some((athleteId) => !available.has(athleteId))) {
      throw new RepositoryError("conflict", "Personnel must use active athletes from this team.");
    }
  }

  const timestamp = nowIso();
  const statements = [
    db.prepare("DELETE FROM play_personnel WHERE play_id = ?").bind(playId),
    ...assignments.map((assignment) => db
      .prepare(
        `INSERT INTO play_personnel (play_id, player_id, athlete_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(playId, assignment.player_id, assignment.athlete_id, timestamp, timestamp)),
  ];
  await db.batch(statements);

  return listPlayPersonnel(db, teamId, playId);
}

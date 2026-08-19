import type { D1Database } from "@cloudflare/workers-types";

import { RepositoryError } from "./repository";

export type StoredPlay = {
  id: string;
  team_id: string;
  name: string;
  side: "offense" | "defense";
  formation_id: string | null;
  formation: string;
  notes: string;
  diagram: unknown;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

type PlayDbRow = Omit<StoredPlay, "diagram" | "archived"> & {
  diagram_json: string;
  archived: number;
};

export type PlayInput = {
  name: string;
  side: "offense" | "defense";
  formation_id: string | null;
  formation: string;
  notes: string;
  diagram: unknown;
};

const nowIso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function fromRow(row: PlayDbRow): StoredPlay {
  return {
    id: row.id,
    team_id: row.team_id,
    name: row.name,
    side: row.side,
    formation_id: row.formation_id,
    formation: row.formation,
    notes: row.notes,
    diagram: JSON.parse(row.diagram_json) as unknown,
    archived: row.archived === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listPlays(db: D1Database, teamId: string, includeArchived = false): Promise<StoredPlay[]> {
  const result = await db
    .prepare(
      `SELECT * FROM plays
       WHERE team_id = ? AND (? = 1 OR archived = 0)
       ORDER BY archived ASC, updated_at DESC, name ASC`,
    )
    .bind(teamId, includeArchived ? 1 : 0)
    .all<PlayDbRow>();
  return result.results.map(fromRow);
}

export async function getPlay(db: D1Database, teamId: string, playId: string): Promise<StoredPlay> {
  const row = await db
    .prepare("SELECT * FROM plays WHERE id = ? AND team_id = ?")
    .bind(playId, teamId)
    .first<PlayDbRow>();
  if (!row) throw new RepositoryError("not_found", "Play not found.");
  return fromRow(row);
}

export async function createPlay(db: D1Database, teamId: string, input: PlayInput): Promise<StoredPlay> {
  const timestamp = nowIso();
  const playId = id("play");
  await db
    .prepare(
      `INSERT INTO plays
        (id, team_id, name, side, formation_id, formation, notes, diagram_json, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(
      playId,
      teamId,
      input.name,
      input.side,
      input.formation_id,
      input.formation,
      input.notes,
      JSON.stringify(input.diagram),
      timestamp,
      timestamp,
    )
    .run();

  return {
    id: playId,
    team_id: teamId,
    ...input,
    archived: false,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export async function updatePlay(
  db: D1Database,
  teamId: string,
  playId: string,
  input: PlayInput & { archived?: boolean },
): Promise<StoredPlay> {
  const existing = await db
    .prepare("SELECT id FROM plays WHERE id = ? AND team_id = ?")
    .bind(playId, teamId)
    .first<{ id: string }>();
  if (!existing) throw new RepositoryError("not_found", "Play not found.");

  const timestamp = nowIso();
  await db
    .prepare(
      `UPDATE plays
       SET name = ?, side = ?, formation_id = ?, formation = ?, notes = ?, diagram_json = ?,
           archived = COALESCE(?, archived), updated_at = ?
       WHERE id = ? AND team_id = ?`,
    )
    .bind(
      input.name,
      input.side,
      input.formation_id,
      input.formation,
      input.notes,
      JSON.stringify(input.diagram),
      input.archived === undefined ? null : input.archived ? 1 : 0,
      timestamp,
      playId,
      teamId,
    )
    .run();

  const row = await db
    .prepare("SELECT * FROM plays WHERE id = ? AND team_id = ?")
    .bind(playId, teamId)
    .first<PlayDbRow>();
  if (!row) throw new RepositoryError("not_found", "Play not found.");
  return fromRow(row);
}

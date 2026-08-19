import type { D1Database } from "@cloudflare/workers-types";

import { RepositoryError } from "./repository";

export type PlaybookFormat = "5v5" | "6v6";

export type StoredPlaybook = {
  id: string;
  team_id: string;
  name: string;
  format: PlaybookFormat;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

type PlaybookDbRow = Omit<StoredPlaybook, "archived"> & { archived: number };

const nowIso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function fromRow(row: PlaybookDbRow): StoredPlaybook {
  return { ...row, archived: row.archived === 1 };
}

export async function listPlaybooks(db: D1Database, teamId: string, includeArchived = false): Promise<StoredPlaybook[]> {
  const result = await db
    .prepare(
      `SELECT * FROM playbooks
       WHERE team_id = ? AND (? = 1 OR archived = 0)
       ORDER BY archived ASC, updated_at DESC, name ASC`,
    )
    .bind(teamId, includeArchived ? 1 : 0)
    .all<PlaybookDbRow>();
  return result.results.map(fromRow);
}

export async function getPlaybook(db: D1Database, teamId: string, playbookId: string): Promise<StoredPlaybook> {
  const row = await db
    .prepare("SELECT * FROM playbooks WHERE id = ? AND team_id = ?")
    .bind(playbookId, teamId)
    .first<PlaybookDbRow>();
  if (!row) throw new RepositoryError("not_found", "Playbook not found.");
  return fromRow(row);
}

export async function createPlaybook(
  db: D1Database,
  teamId: string,
  input: { name: string; format: PlaybookFormat },
): Promise<StoredPlaybook> {
  const timestamp = nowIso();
  const playbookId = id("playbook");
  await db
    .prepare(
      `INSERT INTO playbooks (id, team_id, name, format, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(playbookId, teamId, input.name, input.format, timestamp, timestamp)
    .run();
  return {
    id: playbookId,
    team_id: teamId,
    name: input.name,
    format: input.format,
    archived: false,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export async function updatePlaybook(
  db: D1Database,
  teamId: string,
  playbookId: string,
  input: { name?: string; archived?: boolean },
): Promise<StoredPlaybook> {
  await getPlaybook(db, teamId, playbookId);
  const timestamp = nowIso();
  await db
    .prepare(
      `UPDATE playbooks
       SET name = COALESCE(?, name), archived = COALESCE(?, archived), updated_at = ?
       WHERE id = ? AND team_id = ?`,
    )
    .bind(
      input.name ?? null,
      input.archived === undefined ? null : input.archived ? 1 : 0,
      timestamp,
      playbookId,
      teamId,
    )
    .run();
  return getPlaybook(db, teamId, playbookId);
}

export async function assertPlaybookForTeam(db: D1Database, teamId: string, playbookId: string): Promise<StoredPlaybook> {
  const playbook = await getPlaybook(db, teamId, playbookId);
  if (playbook.archived) throw new RepositoryError("not_found", "Playbook not found.");
  return playbook;
}

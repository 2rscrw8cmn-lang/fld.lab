import type { D1Database } from "@cloudflare/workers-types";

import { getRoster } from "./repository";
import { getSession, TrainingSessionError, type SessionDetail } from "./sessions";

type SessionRow = {
  id: string;
  team_id: string;
  status: "active" | "completed" | "abandoned";
};

const nowIso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export async function addRosterAthletesToSession(
  db: D1Database,
  sessionId: string,
  athleteIds: string[],
): Promise<SessionDetail> {
  const session = await db
    .prepare("SELECT id, team_id, status FROM training_sessions WHERE id = ?")
    .bind(sessionId)
    .first<SessionRow>();

  if (!session) throw new TrainingSessionError("not_found", "Training session not found.");
  if (session.status !== "active") throw new TrainingSessionError("conflict", "Session is no longer active.");

  const requestedIds = [...new Set(athleteIds.map((value) => value.trim()).filter(Boolean))];
  if (!requestedIds.length) {
    throw new TrainingSessionError("validation_error", "Choose at least one athlete to add.", {
      athlete_ids: "At least one athlete is required",
    });
  }

  const roster = await getRoster(db, session.team_id);
  const activeRosterIds = new Set(roster.map((row) => row.athlete.id));
  const invalidIds = requestedIds.filter((athleteId) => !activeRosterIds.has(athleteId));
  if (invalidIds.length) {
    throw new TrainingSessionError(
      "validation_error",
      "Only active athletes on this team can be added to the session.",
      { athlete_ids: "One or more athletes are not on the active roster" },
    );
  }

  const existingRows = await db
    .prepare("SELECT athlete_id FROM session_athletes WHERE session_id = ?")
    .bind(sessionId)
    .all<{ athlete_id: string }>();
  const existingIds = new Set(existingRows.results.map((row) => row.athlete_id));
  const requestedSet = new Set(requestedIds);

  // Preserve current roster order among newly appended athletes.
  const athletesToAdd = roster.filter(
    (row) => requestedSet.has(row.athlete.id) && !existingIds.has(row.athlete.id),
  );
  if (!athletesToAdd.length) return getSession(db, sessionId);

  const maxOrder = await db
    .prepare("SELECT COALESCE(MAX(order_index), -1) AS max_order_index FROM session_athletes WHERE session_id = ?")
    .bind(sessionId)
    .first<{ max_order_index: number }>();
  const startingOrder = maxOrder?.max_order_index ?? -1;
  const timestamp = nowIso();

  await db.batch(
    athletesToAdd.map((row, index) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO session_athletes
            (id, session_id, athlete_id, order_index, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
        )
        .bind(
          id("session_athlete"),
          sessionId,
          row.athlete.id,
          startingOrder + index + 1,
          timestamp,
          timestamp,
        ),
    ),
  );

  return getSession(db, sessionId);
}

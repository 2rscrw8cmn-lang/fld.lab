import type { D1Database } from "@cloudflare/workers-types";

import type { AuthenticatedCoach } from "./auth";
import type { Team } from "./db/repository";

export type TeamRole = "owner" | "coach";

export type CoachRecord = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthorizationContext = {
  coach: CoachRecord;
  authorizedEmails: string[];
};

export type AccessibleTeam = Team & {
  access_role: TeamRole;
};

export type TeamCoachView = {
  id: string;
  email: string;
  display_name: string | null;
  role: TeamRole;
};

export class AuthorizationError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409,
    public readonly code: "validation_error" | "forbidden" | "not_found" | "conflict",
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

const nowIso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export function parseCoachEmails(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

async function ensureCoach(db: D1Database, email: string): Promise<CoachRecord> {
  const normalized = normalizeEmail(email);
  const existing = await db.prepare("SELECT * FROM coaches WHERE email = ? COLLATE NOCASE").bind(normalized).first<CoachRecord>();
  if (existing) return existing;

  const timestamp = nowIso();
  await db
    .prepare(
      "INSERT OR IGNORE INTO coaches (id, email, display_name, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)",
    )
    .bind(id("coach"), normalized, timestamp, timestamp)
    .run();

  const created = await db.prepare("SELECT * FROM coaches WHERE email = ? COLLATE NOCASE").bind(normalized).first<CoachRecord>();
  if (!created) throw new Error("Coach record could not be initialized.");
  return created;
}

export async function initializeAuthorization(
  db: D1Database,
  identity: AuthenticatedCoach,
  configuredEmails?: string,
): Promise<AuthorizationContext> {
  const authorizedEmails = parseCoachEmails(configuredEmails);
  if (!authorizedEmails.includes(identity.email)) authorizedEmails.push(identity.email);

  const coaches: CoachRecord[] = [];
  for (const email of authorizedEmails) coaches.push(await ensureCoach(db, email));

  const legacyTeams = await db
    .prepare(
      `SELECT t.id
       FROM teams t
       WHERE NOT EXISTS (
         SELECT 1 FROM team_coaches tc WHERE tc.team_id = t.id
       )`,
    )
    .all<{ id: string }>();

  for (const team of legacyTeams.results) {
    const timestamp = nowIso();
    await db.batch(
      coaches.map((coach) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO team_coaches
              (id, team_id, coach_id, role, active, created_at, updated_at)
             VALUES (?, ?, ?, 'owner', 1, ?, ?)`,
          )
          .bind(id("team_coach"), team.id, coach.id, timestamp, timestamp),
      ),
    );
  }

  const coach = coaches.find((candidate) => candidate.email.toLowerCase() === identity.email.toLowerCase())
    ?? await ensureCoach(db, identity.email);
  return { coach, authorizedEmails };
}

export function authorizationErrorResponse(error: AuthorizationError) {
  return Response.json(
    { error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function requireTeamAccess(
  db: D1Database,
  coachId: string,
  teamId: string,
  requiredRole: "member" | "owner" = "member",
): Promise<TeamRole> {
  const row = await db
    .prepare(
      `SELECT tc.role
       FROM team_coaches tc
       JOIN teams t ON t.id = tc.team_id
       WHERE tc.team_id = ? AND tc.coach_id = ? AND tc.active = 1`,
    )
    .bind(teamId, coachId)
    .first<{ role: TeamRole }>();

  if (!row) throw new AuthorizationError(404, "not_found", "Team not found.");
  if (requiredRole === "owner" && row.role !== "owner") {
    throw new AuthorizationError(403, "forbidden", "Team owner access is required for this action.");
  }
  return row.role;
}

async function requireSessionAccess(db: D1Database, coachId: string, sessionId: string) {
  const row = await db
    .prepare("SELECT team_id FROM training_sessions WHERE id = ?")
    .bind(sessionId)
    .first<{ team_id: string }>();
  if (!row) throw new AuthorizationError(404, "not_found", "Training session not found.");
  await requireTeamAccess(db, coachId, row.team_id);
}

async function requireMembershipAccess(db: D1Database, coachId: string, membershipId: string) {
  const row = await db
    .prepare("SELECT team_id FROM team_memberships WHERE id = ?")
    .bind(membershipId)
    .first<{ team_id: string }>();
  if (!row) throw new AuthorizationError(404, "not_found", "Team membership not found.");
  await requireTeamAccess(db, coachId, row.team_id);
}

async function requireAthleteAccess(db: D1Database, coachId: string, athleteId: string, teamId?: string) {
  if (teamId) {
    await requireTeamAccess(db, coachId, teamId);
    const membership = await db
      .prepare("SELECT id FROM team_memberships WHERE team_id = ? AND athlete_id = ?")
      .bind(teamId, athleteId)
      .first<{ id: string }>();
    if (!membership) throw new AuthorizationError(404, "not_found", "Athlete not found.");
    return;
  }

  const row = await db
    .prepare(
      `SELECT tm.id
       FROM team_memberships tm
       JOIN team_coaches tc ON tc.team_id = tm.team_id
       WHERE tm.athlete_id = ? AND tc.coach_id = ? AND tc.active = 1
       LIMIT 1`,
    )
    .bind(athleteId, coachId)
    .first<{ id: string }>();
  if (!row) throw new AuthorizationError(404, "not_found", "Athlete not found.");
}

async function jsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.clone().json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function authorizeApiRequest(request: Request, db: D1Database, context: AuthorizationContext): Promise<void> {
  const url = new URL(request.url);
  const { pathname } = url;
  const coachId = context.coach.id;

  const leaderboard = pathname.match(/^\/api\/drills\/([^/]+)\/leaderboard$/);
  if (leaderboard) {
    const teamId = url.searchParams.get("team_id")?.trim();
    if (!teamId) {
      throw new AuthorizationError(400, "validation_error", "team_id is required.", { team_id: "Required" });
    }
    await requireTeamAccess(db, coachId, teamId);
    return;
  }

  if (
    pathname === "/api/drills" ||
    pathname === "/api/drills/import" ||
    /^\/api\/drills\/[^/]+$/.test(pathname) ||
    pathname === "/api/teams" ||
    pathname === "/api/team-admin/teams"
  ) {
    return;
  }

  const teamCoachMember = pathname.match(/^\/api\/teams\/([^/]+)\/coaches\/([^/]+)$/);
  if (teamCoachMember) {
    await requireTeamAccess(db, coachId, decodeURIComponent(teamCoachMember[1]), "owner");
    return;
  }

  const teamCoaches = pathname.match(/^\/api\/teams\/([^/]+)\/coaches$/);
  if (teamCoaches) {
    await requireTeamAccess(
      db,
      coachId,
      decodeURIComponent(teamCoaches[1]),
      request.method === "GET" ? "member" : "owner",
    );
    return;
  }

  const teamResource = pathname.match(/^\/api\/teams\/([^/]+)(?:\/.*)?$/);
  if (teamResource) {
    const teamId = decodeURIComponent(teamResource[1]);
    const exactTeam = pathname === `/api/teams/${encodeURIComponent(teamId)}` || pathname === `/api/teams/${teamResource[1]}`;
    await requireTeamAccess(db, coachId, teamId, exactTeam && request.method === "PATCH" ? "owner" : "member");

    if (request.method === "POST" && /^\/api\/teams\/[^/]+\/roster$/.test(pathname)) {
      const body = await jsonObject(request);
      const existingAthleteId = typeof body?.athlete_id === "string" ? body.athlete_id.trim() : "";
      if (existingAthleteId) await requireAthleteAccess(db, coachId, existingAthleteId);
    }
    return;
  }

  const membership = pathname.match(/^\/api\/team-memberships\/([^/]+)$/);
  if (membership) {
    await requireMembershipAccess(db, coachId, decodeURIComponent(membership[1]));
    return;
  }

  const athleteResults = pathname.match(/^\/api\/athletes\/([^/]+)\/results$/);
  if (athleteResults) {
    const teamId = url.searchParams.get("team_id")?.trim();
    if (!teamId) {
      throw new AuthorizationError(400, "validation_error", "team_id is required for athlete results.", { team_id: "Required" });
    }
    await requireAthleteAccess(db, coachId, decodeURIComponent(athleteResults[1]), teamId);
    return;
  }

  const athlete = pathname.match(/^\/api\/athletes\/([^/]+)$/);
  if (athlete) {
    await requireAthleteAccess(db, coachId, decodeURIComponent(athlete[1]));
    return;
  }

  if (pathname === "/api/sessions" && request.method === "POST") {
    const body = await jsonObject(request);
    const teamId = typeof body?.team_id === "string" ? body.team_id.trim() : "";
    if (!teamId) {
      throw new AuthorizationError(400, "validation_error", "team_id is required.", { team_id: "Required" });
    }
    await requireTeamAccess(db, coachId, teamId);
    return;
  }

  const session = pathname.match(/^\/api\/sessions\/([^/]+)(?:\/.*)?$/);
  if (session) {
    await requireSessionAccess(db, coachId, decodeURIComponent(session[1]));
    return;
  }

  if (
    pathname.startsWith("/api/teams/") ||
    pathname.startsWith("/api/team-admin/") ||
    pathname.startsWith("/api/team-memberships/") ||
    pathname.startsWith("/api/athletes/") ||
    pathname.startsWith("/api/sessions/")
  ) {
    throw new AuthorizationError(404, "not_found", "API route not found.");
  }
}

export async function listAccessibleTeams(
  db: D1Database,
  coachId: string,
  includeInactive = false,
): Promise<AccessibleTeam[]> {
  const result = await db
    .prepare(
      `SELECT
        t.id,
        t.name,
        t.age_group,
        t.season_label,
        t.active,
        t.created_at,
        t.updated_at,
        tc.role AS access_role
       FROM team_coaches tc
       JOIN teams t ON t.id = tc.team_id
       WHERE tc.coach_id = ? AND tc.active = 1 AND (? = 1 OR t.active = 1)
       ORDER BY t.active DESC, t.name, t.season_label`,
    )
    .bind(coachId, includeInactive ? 1 : 0)
    .all<Omit<AccessibleTeam, "active"> & { active: number }>();

  return result.results.map((row) => ({ ...row, active: row.active === 1 }));
}

export async function createOwnedTeam(
  db: D1Database,
  coachId: string,
  input: { name: string; age_group?: string | null; season_label?: string | null },
): Promise<AccessibleTeam> {
  const timestamp = nowIso();
  const team: AccessibleTeam = {
    id: id("team"),
    name: input.name,
    age_group: input.age_group ?? null,
    season_label: input.season_label ?? null,
    active: true,
    created_at: timestamp,
    updated_at: timestamp,
    access_role: "owner",
  };

  await db.batch([
    db
      .prepare(
        "INSERT INTO teams (id, name, age_group, season_label, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
      )
      .bind(team.id, team.name, team.age_group, team.season_label, timestamp, timestamp),
    db
      .prepare(
        `INSERT INTO team_coaches
          (id, team_id, coach_id, role, active, created_at, updated_at)
         VALUES (?, ?, ?, 'owner', 1, ?, ?)`,
      )
      .bind(id("team_coach"), team.id, coachId, timestamp, timestamp),
  ]);

  return team;
}

export async function roleForTeam(db: D1Database, coachId: string, teamId: string): Promise<TeamRole> {
  return requireTeamAccess(db, coachId, teamId);
}

export async function listTeamCoaches(db: D1Database, teamId: string): Promise<TeamCoachView[]> {
  const result = await db
    .prepare(
      `SELECT c.id, c.email, c.display_name, tc.role
       FROM team_coaches tc
       JOIN coaches c ON c.id = tc.coach_id
       WHERE tc.team_id = ? AND tc.active = 1
       ORDER BY CASE tc.role WHEN 'owner' THEN 0 ELSE 1 END, c.email`,
    )
    .bind(teamId)
    .all<TeamCoachView>();
  return result.results;
}

export async function addTeamCoach(
  db: D1Database,
  teamId: string,
  email: string,
  authorizedEmails: string[],
): Promise<TeamCoachView> {
  const normalized = normalizeEmail(email);
  if (!normalized || !authorizedEmails.includes(normalized)) {
    throw new AuthorizationError(
      400,
      "validation_error",
      "That coach must first be allowed by the fld.LAB Cloudflare Access policy and authorized coach allowlist.",
      { email: "Coach is not in the authorized deployment allowlist" },
    );
  }

  const coach = await ensureCoach(db, normalized);
  const existing = await db
    .prepare("SELECT id, role, active FROM team_coaches WHERE team_id = ? AND coach_id = ?")
    .bind(teamId, coach.id)
    .first<{ id: string; role: TeamRole; active: number }>();

  if (existing) {
    if (existing.active !== 1) {
      await db
        .prepare("UPDATE team_coaches SET active = 1, updated_at = ? WHERE id = ?")
        .bind(nowIso(), existing.id)
        .run();
    }
    return { id: coach.id, email: coach.email, display_name: coach.display_name, role: existing.role };
  }

  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO team_coaches
        (id, team_id, coach_id, role, active, created_at, updated_at)
       VALUES (?, ?, ?, 'coach', 1, ?, ?)`,
    )
    .bind(id("team_coach"), teamId, coach.id, timestamp, timestamp)
    .run();

  return { id: coach.id, email: coach.email, display_name: coach.display_name, role: "coach" };
}

export async function removeTeamCoach(
  db: D1Database,
  teamId: string,
  targetCoachId: string,
  actingCoachId: string,
): Promise<void> {
  if (targetCoachId === actingCoachId) {
    throw new AuthorizationError(409, "conflict", "You cannot remove your own team access.");
  }

  const target = await db
    .prepare("SELECT id, role FROM team_coaches WHERE team_id = ? AND coach_id = ? AND active = 1")
    .bind(teamId, targetCoachId)
    .first<{ id: string; role: TeamRole }>();
  if (!target) throw new AuthorizationError(404, "not_found", "Coach access not found.");

  if (target.role === "owner") {
    const owners = await db
      .prepare("SELECT COUNT(*) AS count FROM team_coaches WHERE team_id = ? AND role = 'owner' AND active = 1")
      .bind(teamId)
      .first<{ count: number }>();
    if (!owners || owners.count <= 1) {
      throw new AuthorizationError(409, "conflict", "A team must keep at least one owner.");
    }
  }

  await db
    .prepare("UPDATE team_coaches SET active = 0, updated_at = ? WHERE id = ?")
    .bind(nowIso(), target.id)
    .run();
}

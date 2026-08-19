import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";

import { handlePlaybookApi } from "../worker/playbook/routes";

const validDiagram = {
  schema_version: 2,
  players: [
    { id: "player_x", label: "X", x: 20, y: 80 },
    { id: "player_qb", label: "QB", x: 50, y: 90 },
  ],
  assignments: [
    {
      id: "assignment_1",
      player_id: "player_x",
      kind: "route",
      template: "slant",
      points: [{ x: 20, y: 80 }, { x: 40, y: 60 }],
    },
  ],
  primary_target_player_id: "player_x",
};

const noDatabaseCalls = {} as D1Database;

describe("playbook migrations", () => {
  const persistenceMigration = readFileSync(
    fileURLToPath(new URL("../migrations/0005_playbook.sql", import.meta.url)),
    "utf8",
  );
  const organizationMigration = readFileSync(
    fileURLToPath(new URL("../migrations/0006_playbook_organization.sql", import.meta.url)),
    "utf8",
  );

  it("creates team-scoped archived plays", () => {
    expect(persistenceMigration).toContain("CREATE TABLE plays");
    expect(persistenceMigration).toContain("team_id TEXT NOT NULL");
    expect(persistenceMigration).toContain("CHECK (side IN ('offense', 'defense'))");
    expect(persistenceMigration).toContain("diagram_json TEXT NOT NULL");
    expect(persistenceMigration).toContain("archived INTEGER NOT NULL DEFAULT 0");
    expect(persistenceMigration).toContain("FOREIGN KEY (team_id) REFERENCES teams(id)");
  });

  it("adds active/library and football-specific organization fields", () => {
    expect(organizationMigration).toContain("active_play INTEGER NOT NULL DEFAULT 1");
    expect(organizationMigration).toContain("CHECK (play_type IN ('pass', 'run', 'option'))");
    expect(organizationMigration).toContain("concept TEXT NOT NULL DEFAULT ''");
    expect(organizationMigration).toContain("CHECK (situation IN ('any', 'short', 'medium', 'deep', 'no-run', 'goal-line', 'conversion'))");
  });
});

describe("playbook API validation", () => {
  it("rejects malformed diagram data before touching D1", async () => {
    const response = await handlePlaybookApi(
      new Request("https://fld-lab.test/api/teams/team_1/plays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Trips Flood",
          side: "offense",
          formation_id: "trips-right",
          formation: "Trips Right",
          notes: "",
          diagram: { ...validDiagram, schema_version: 1 },
        }),
      }),
      noDatabaseCalls,
    );

    expect(response?.status).toBe(400);
    const body = await response?.json() as { error: { fields?: Record<string, string> } };
    expect(body.error.fields?.diagram).toContain("schema v2");
  });

  it("rejects a primary target that is not a player in the diagram", async () => {
    const response = await handlePlaybookApi(
      new Request("https://fld-lab.test/api/teams/team_1/plays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Trips Flood",
          side: "offense",
          formation_id: "trips-right",
          formation: "Trips Right",
          notes: "",
          diagram: { ...validDiagram, primary_target_player_id: "player_missing" },
        }),
      }),
      noDatabaseCalls,
    );

    expect(response?.status).toBe(400);
  });

  it("rejects unsupported play types before touching D1", async () => {
    const response = await handlePlaybookApi(
      new Request("https://fld-lab.test/api/teams/team_1/plays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Trips Flood",
          side: "offense",
          formation_id: "trips-right",
          formation: "Trips Right",
          play_type: "screen-pass",
          concept: "Flood",
          situation: "medium",
          active_play: true,
          notes: "",
          diagram: validDiagram,
        }),
      }),
      noDatabaseCalls,
    );

    expect(response?.status).toBe(400);
    const body = await response?.json() as { error: { fields?: Record<string, string> } };
    expect(body.error.fields?.play_type).toContain("pass, run, or option");
  });
});

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

describe("playbook migration", () => {
  const migration = readFileSync(
    fileURLToPath(new URL("../migrations/0005_playbook.sql", import.meta.url)),
    "utf8",
  );

  it("creates team-scoped archived plays", () => {
    expect(migration).toContain("CREATE TABLE plays");
    expect(migration).toContain("team_id TEXT NOT NULL");
    expect(migration).toContain("CHECK (side IN ('offense', 'defense'))");
    expect(migration).toContain("diagram_json TEXT NOT NULL");
    expect(migration).toContain("archived INTEGER NOT NULL DEFAULT 0");
    expect(migration).toContain("FOREIGN KEY (team_id) REFERENCES teams(id)");
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
});

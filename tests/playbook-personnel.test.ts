import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validatePersonnelAssignments } from "../worker/playbook/personnel-routes";

describe("playbook personnel migration", () => {
  const migration = readFileSync(
    fileURLToPath(new URL("../migrations/0007_playbook_personnel.sql", import.meta.url)),
    "utf8",
  );

  it("stores one roster athlete per play diagram player", () => {
    expect(migration).toContain("CREATE TABLE play_personnel");
    expect(migration).toContain("PRIMARY KEY (play_id, player_id)");
    expect(migration).toContain("FOREIGN KEY (play_id) REFERENCES plays(id) ON DELETE CASCADE");
    expect(migration).toContain("FOREIGN KEY (athlete_id) REFERENCES athletes(id)");
  });
});

describe("playbook personnel validation", () => {
  const playerIds = new Set(["player_x", "player_y", "player_qb"]);

  it("accepts unique athlete mappings for diagram players", () => {
    const parsed = validatePersonnelAssignments(
      [
        { player_id: "player_x", athlete_id: "athlete_1" },
        { player_id: "player_qb", athlete_id: "athlete_2" },
      ],
      playerIds,
    );

    expect(parsed.assignments).toEqual([
      { player_id: "player_x", athlete_id: "athlete_1" },
      { player_id: "player_qb", athlete_id: "athlete_2" },
    ]);
  });

  it("rejects personnel for a player that is not in the diagram", () => {
    const parsed = validatePersonnelAssignments(
      [{ player_id: "player_missing", athlete_id: "athlete_1" }],
      playerIds,
    );

    expect(parsed.assignments).toBeUndefined();
    expect(parsed.message).toContain("play diagram");
  });

  it("rejects assigning one athlete to two positions", () => {
    const parsed = validatePersonnelAssignments(
      [
        { player_id: "player_x", athlete_id: "athlete_1" },
        { player_id: "player_y", athlete_id: "athlete_1" },
      ],
      playerIds,
    );

    expect(parsed.assignments).toBeUndefined();
    expect(parsed.message).toContain("one position");
  });

  it("rejects duplicate assignments for the same play position", () => {
    const parsed = validatePersonnelAssignments(
      [
        { player_id: "player_x", athlete_id: "athlete_1" },
        { player_id: "player_x", athlete_id: "athlete_2" },
      ],
      playerIds,
    );

    expect(parsed.assignments).toBeUndefined();
    expect(parsed.message).toContain("one athlete");
  });
});

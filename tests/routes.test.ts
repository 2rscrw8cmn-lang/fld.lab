import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { APP_ROUTES, getRoute } from "../src/app/routes";
import worker, { createHealthPayload } from "../worker/index";

describe("application scaffold", () => {
  it("defines the canonical primary routes", () => {
    expect(APP_ROUTES.map((route) => route.path)).toEqual([
      "/",
      "/roster",
      "/train",
      "/data",
      "/drills",
      "/settings"
    ]);
  });

  it("falls back to Home for an unknown client route", () => {
    expect(getRoute("/not-a-route").path).toBe("/");
  });

  it("creates the documented health payload", () => {
    expect(createHealthPayload()).toEqual({ ok: true });
  });

  it("serves the Worker health endpoint without requiring D1", async () => {
    const response = await worker.fetch(new Request("https://fld-lab.test/api/health"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});

describe("Phase 1 roster migration", () => {
  const migrationPath = fileURLToPath(new URL("../migrations/0001_initial_roster.sql", import.meta.url));
  const migration = readFileSync(migrationPath, "utf8");

  it("creates the three roster-owned tables", () => {
    expect(migration).toContain("CREATE TABLE teams");
    expect(migration).toContain("CREATE TABLE athletes");
    expect(migration).toContain("CREATE TABLE team_memberships");
  });

  it("keeps jersey and positions on membership instead of athlete identity", () => {
    const athleteTable = migration.split("CREATE TABLE athletes (")[1].split("CREATE TABLE team_memberships")[0];
    const membershipTable = migration.split("CREATE TABLE team_memberships (")[1];

    expect(athleteTable).not.toContain("jersey_number");
    expect(athleteTable).not.toContain("primary_position");
    expect(membershipTable).toContain("jersey_number TEXT");
    expect(membershipTable).toContain("primary_position TEXT");
    expect(membershipTable).toContain("secondary_position TEXT");
  });

  it("prevents duplicate team membership for one athlete", () => {
    expect(migration).toContain("UNIQUE (team_id, athlete_id)");
  });
});

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

  it("creates a safe health payload when auth bindings are missing", () => {
    expect(createHealthPayload()).toEqual({
      ok: true,
      auth: {
        diagnostic: "auth-runtime-v1",
        configured: false,
        mode: null,
        missing: ["AUTH_MODE", "ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "AUTHORIZED_COACH_EMAILS"],
        invalid: [],
      },
    });
  });

  it("reports configured auth bindings without exposing their values", () => {
    const payload = createHealthPayload({
      DB: {} as never,
      AUTH_MODE: "access",
      ACCESS_TEAM_DOMAIN: "https://example.cloudflareaccess.com",
      ACCESS_AUD: "aud-secret-value",
      AUTHORIZED_COACH_EMAILS: "coach@example.com",
    } as never);

    expect(payload.auth).toEqual({
      diagnostic: "auth-runtime-v1",
      configured: true,
      mode: "access",
      missing: [],
      invalid: [],
    });
    expect(JSON.stringify(payload)).not.toContain("aud-secret-value");
    expect(JSON.stringify(payload)).not.toContain("coach@example.com");
  });

  it("serves the Worker health endpoint without requiring D1", async () => {
    const response = await worker.fetch(new Request("https://fld-lab.test/api/health"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      auth: {
        diagnostic: "auth-runtime-v1",
        configured: false,
        mode: null,
        missing: ["AUTH_MODE", "ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "AUTHORIZED_COACH_EMAILS"],
        invalid: [],
      },
    });
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

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";

import {
  AuthorizationError,
  authorizeApiRequest,
  parseCoachEmails,
  type AuthorizationContext,
} from "../worker/authorization";

const context: AuthorizationContext = {
  coach: {
    id: "coach_current",
    email: "current@example.com",
    display_name: null,
    created_at: "2026-08-18T00:00:00.000Z",
    updated_at: "2026-08-18T00:00:00.000Z",
  },
  authorizedEmails: ["current@example.com", "other@example.com"],
};

function teamAccessDb(role: "owner" | "coach" | null): D1Database {
  return {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              return role ? { role } : null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("coach team authorization", () => {
  it("normalizes the deployment coach allowlist without embedding account-specific values", () => {
    expect(parseCoachEmails(" Coach@One.test,coach@one.test, second@two.test ")).toEqual([
      "coach@one.test",
      "second@two.test",
    ]);
  });

  it("allows an accessible coach to read a team-scoped route", async () => {
    await expect(
      authorizeApiRequest(
        new Request("https://fld-lab.test/api/teams/team_1/roster"),
        teamAccessDb("coach"),
        context,
      ),
    ).resolves.toBeUndefined();
  });

  it("hides inaccessible teams behind not found", async () => {
    await expect(
      authorizeApiRequest(
        new Request("https://fld-lab.test/api/teams/team_1/roster"),
        teamAccessDb(null),
        context,
      ),
    ).rejects.toMatchObject<Partial<AuthorizationError>>({ status: 404, code: "not_found" });
  });

  it("requires owner access to mutate team settings", async () => {
    await expect(
      authorizeApiRequest(
        new Request("https://fld-lab.test/api/teams/team_1", { method: "PATCH", body: "{}" }),
        teamAccessDb("coach"),
        context,
      ),
    ).rejects.toMatchObject<Partial<AuthorizationError>>({ status: 403, code: "forbidden" });
  });

  it("requires team context for athlete performance reads", async () => {
    await expect(
      authorizeApiRequest(
        new Request("https://fld-lab.test/api/athletes/athlete_1/results"),
        teamAccessDb("owner"),
        context,
      ),
    ).rejects.toMatchObject<Partial<AuthorizationError>>({ status: 400, code: "validation_error" });
  });

  it("keeps global drill configuration available to an authenticated coach", async () => {
    await expect(
      authorizeApiRequest(
        new Request("https://fld-lab.test/api/drills"),
        teamAccessDb(null),
        context,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("coach ownership migration", () => {
  const migration = readFileSync(
    fileURLToPath(new URL("../migrations/0004_coach_team_access.sql", import.meta.url)),
    "utf8",
  );

  it("creates coach identity and team permission tables", () => {
    expect(migration).toContain("CREATE TABLE coaches");
    expect(migration).toContain("CREATE TABLE team_coaches");
    expect(migration).toContain("CHECK (role IN ('owner', 'coach'))");
    expect(migration).toContain("UNIQUE (team_id, coach_id)");
  });

  it("does not hard-code production coach identities", () => {
    expect(migration).not.toMatch(/@basecm\.com/i);
  });
});

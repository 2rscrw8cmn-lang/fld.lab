import { describe, expect, it } from "vitest";

import { recentDrillsFromSessions } from "../src/features/home/recent-drills";
import type { SessionSummary } from "../src/lib/history-api";

function session(overrides: Partial<SessionSummary> & Pick<SessionSummary, "id" | "drill_id" | "drill_name" | "started_at">): SessionSummary {
  return {
    team_id: "team-1",
    drill_version_id: `version-${overrides.drill_id}`,
    drill_category: "Speed",
    completed_at: null,
    status: "completed",
    athlete_count: 8,
    completed_count: 8,
    skipped_count: 0,
    attempt_count: 16,
    ...overrides,
  };
}

describe("recentDrillsFromSessions", () => {
  it("returns unique drills in most-recent-use order", () => {
    const result = recentDrillsFromSessions([
      session({ id: "s1", drill_id: "sprint", drill_name: "50-Yard Sprint", started_at: "2026-08-18T16:00:00Z" }),
      session({ id: "s2", drill_id: "shuttle", drill_name: "5-10-5 Shuttle", started_at: "2026-08-17T16:00:00Z" }),
      session({ id: "s3", drill_id: "sprint", drill_name: "50-Yard Sprint", started_at: "2026-08-16T16:00:00Z" }),
    ]);

    expect(result.map((drill) => drill.id)).toEqual(["sprint", "shuttle"]);
    expect(result[0].lastUsedAt).toBe("2026-08-18T16:00:00Z");
  });

  it("ignores active sessions and honors the limit", () => {
    const result = recentDrillsFromSessions([
      session({ id: "active", drill_id: "catch", drill_name: "Quick Catch", started_at: "2026-08-19T16:00:00Z", status: "active" }),
      session({ id: "s1", drill_id: "sprint", drill_name: "50-Yard Sprint", started_at: "2026-08-18T16:00:00Z" }),
      session({ id: "s2", drill_id: "shuttle", drill_name: "5-10-5 Shuttle", started_at: "2026-08-17T16:00:00Z" }),
    ], 1);

    expect(result.map((drill) => drill.id)).toEqual(["sprint"]);
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  canonicalizeDrillDefinition,
  validateDrillDefinition,
  type DrillDefinition,
} from "../worker/drills/definition";
import { missingStarterDrills, STARTER_DRILLS } from "../worker/drills/starters";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8"));
}

describe("drill definition validation", () => {
  const starterPaths = [
    "../drills/starter/quick-catch-10.json",
    "../drills/starter/20-yard-sprint.json",
    "../drills/starter/50-yard-sprint.json",
    "../drills/starter/5-10-5-shuttle.json",
    "../drills/starter/l-drill.json",
    "../drills/starter/t-drill.json",
    "../drills/starter/high-jump.json",
    "../drills/starter/long-jump.json",
    "../drills/starter/throw-distance.json",
  ];

  it.each(starterPaths)("accepts starter definition %s", (path) => {
    expect(validateDrillDefinition(readJson(path)).ok).toBe(true);
  });

  it("keeps the runtime starter catalog aligned with all nine definitions", () => {
    expect(STARTER_DRILLS.map((starter) => starter.definition.slug)).toEqual([
      "quick-catch-10",
      "20-yard-sprint",
      "50-yard-sprint",
      "5-10-5-shuttle",
      "l-drill",
      "t-drill",
      "high-jump",
      "long-jump",
      "throw-distance",
    ]);
  });

  it("seeds only starter slugs that are not already present", () => {
    const missing = missingStarterDrills([
      { slug: "quick-catch-10" },
      { slug: "20-yard-sprint" },
      { slug: "50-yard-sprint" },
    ]);

    expect(missing.map((starter) => starter.definition.slug)).toEqual([
      "5-10-5-shuttle",
      "l-drill",
      "t-drill",
      "high-jump",
      "long-jump",
      "throw-distance",
    ]);

    expect(missingStarterDrills(STARTER_DRILLS.map((starter) => ({ slug: starter.definition.slug })))).toHaveLength(0);
  });

  it("rejects the obsolete timed measurement type", () => {
    const definition = readJson("../drills/starter/20-yard-sprint.json") as Record<string, unknown>;
    definition.measurement = { type: "timed", unit: "ms", direction: "lower" };

    const result = validateDrillDefinition(definition);
    expect(result.ok).toBe(false);
  });

  it("rejects a timer enabled for a non-time measurement", () => {
    const definition = readJson("../drills/starter/quick-catch-10.json") as DrillDefinition;
    definition.timer = { enabled: true, splits: [] };

    const result = validateDrillDefinition(definition);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fields["timer.enabled"]).toMatch(/only be enabled/i);
  });

  it("rejects duplicate configured split keys", () => {
    const definition = readJson("../drills/starter/20-yard-sprint.json") as DrillDefinition;
    definition.timer = {
      enabled: true,
      splits: [
        { key: "split_10yd", label: "10 yd" },
        { key: "split_10yd", label: "Ten yards again" },
      ],
    };

    const result = validateDrillDefinition(definition);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fields["timer.splits.1.key"]).toMatch(/unique/i);
  });

  it("canonicalizes object key order for idempotent re-import", () => {
    const definition = readJson("../drills/starter/5-10-5-shuttle.json") as DrillDefinition;
    const reordered = {
      attempts: definition.attempts,
      measurement: definition.measurement,
      category: definition.category,
      name: definition.name,
      slug: definition.slug,
      schema_version: definition.schema_version,
      positions: definition.positions,
      tags: definition.tags,
      equipment: definition.equipment,
      instructions: definition.instructions,
      description: definition.description,
      icon: definition.icon,
      timer: definition.timer,
    } as DrillDefinition;

    expect(canonicalizeDrillDefinition(reordered)).toBe(canonicalizeDrillDefinition(definition));
  });
});

describe("Phase 2 drill migration", () => {
  const migration = readFileSync(
    fileURLToPath(new URL("../migrations/0002_drills.sql", import.meta.url)),
    "utf8",
  );

  it("creates stable drills and immutable drill versions", () => {
    expect(migration).toContain("CREATE TABLE drills");
    expect(migration).toContain("CREATE TABLE drill_versions");
    expect(migration).toContain("slug TEXT NOT NULL UNIQUE");
    expect(migration).toContain("UNIQUE (drill_id, version)");
    expect(migration).toContain("CREATE TRIGGER prevent_drill_version_update");
    expect(migration).toContain("CREATE TRIGGER prevent_drill_version_delete");
  });

  it("guards the current version pointer", () => {
    expect(migration).toContain("CREATE TRIGGER validate_drills_current_version_update");
    expect(migration).toContain("current_version_id must belong to drill");
  });
});

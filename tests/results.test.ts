import { describe, expect, it } from "vitest";

import type { DrillDefinition } from "../worker/drills/definition";
import { aggregateResultValues, metricForDefinition } from "../worker/db/results";

function drill(measurement: DrillDefinition["measurement"], result: DrillDefinition["attempts"]["result"] = "best"): DrillDefinition {
  return {
    schema_version: 1,
    slug: "test",
    name: "Test",
    category: "Test",
    measurement,
    attempts: { count: 2, result },
    timer: measurement.type === "time" ? { enabled: true, splits: [] } : { enabled: false, splits: [] },
  };
}

describe("derived training results", () => {
  it("uses the correct primary metric for timed and catch drills", () => {
    expect(metricForDefinition(drill({ type: "time", direction: "lower", unit: "ms" }))).toMatchObject({
      type: "time",
      key: "total_time",
      unit: "ms",
      direction: "lower",
    });

    expect(metricForDefinition(drill({ type: "successes_attempts", direction: "higher", unit: "count", total_attempts: 10 }))).toMatchObject({
      type: "successes_attempts",
      key: "successes",
      total_attempts: 10,
      direction: "higher",
    });
  });

  it("respects best direction", () => {
    expect(aggregateResultValues([4300, 4100], "best", "lower")).toBe(4100);
    expect(aggregateResultValues([7, 9], "best", "higher")).toBe(9);
  });

  it("supports average, latest, and total session aggregation", () => {
    expect(aggregateResultValues([4, 6], "average", "higher")).toBe(5);
    expect(aggregateResultValues([4, 6], "latest", "higher")).toBe(6);
    expect(aggregateResultValues([4, 6], "total", "higher")).toBe(10);
  });

  it("uses the first configured custom numeric field as the v1 comparable metric", () => {
    expect(metricForDefinition(drill({
      type: "custom_numeric",
      direction: "higher",
      fields: [
        { key: "accuracy", label: "Accuracy", unit: "%" },
        { key: "speed", label: "Speed", unit: "mph" },
      ],
    }))).toMatchObject({ key: "accuracy", label: "Accuracy", unit: "%" });
  });
});

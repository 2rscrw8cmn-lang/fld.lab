import { describe, expect, it } from "vitest";

import type { DrillDefinition } from "../worker/drills/definition";
import { validateAttemptAgainstDefinition } from "../worker/sessions/attempt-validation";

function definition(measurement: DrillDefinition["measurement"]): DrillDefinition {
  return {
    schema_version: 1,
    slug: "test-drill",
    name: "Test Drill",
    category: "Test",
    measurement,
    attempts: { count: 2, result: "best" },
    timer: measurement.type === "time" ? { enabled: true, splits: [{ key: "split_10", label: "10 yd" }] } : { enabled: false, splits: [] },
  };
}

describe("training attempt validation", () => {
  it("preserves timed total + split validation", () => {
    const fields = validateAttemptAgainstDefinition(
      definition({ type: "time", direction: "lower", unit: "ms" }),
      {
        attempt_number: 1,
        elapsed_ms: 4200,
        measurements: [
          { key: "total_time", label: "Total Time", value_numeric: 4200, unit: "ms", sequence: 0 },
          { key: "split_10", label: "10 yd", value_numeric: 2200, unit: "ms", sequence: 1 },
        ],
      },
    );
    expect(fields).toEqual({});
  });

  it("validates successes and configured attempts", () => {
    const drill = definition({ type: "successes_attempts", direction: "higher", unit: "count", total_attempts: 10 });
    expect(validateAttemptAgainstDefinition(drill, {
      attempt_number: 1,
      elapsed_ms: null,
      measurements: [
        { key: "successes", label: "Successes", value_numeric: 8, unit: "count", sequence: 0 },
        { key: "attempts", label: "Attempts", value_numeric: 10, unit: "count", sequence: 1 },
      ],
    })).toEqual({});

    const invalid = validateAttemptAgainstDefinition(drill, {
      attempt_number: 1,
      elapsed_ms: null,
      measurements: [
        { key: "successes", label: "Successes", value_numeric: 11, unit: "count", sequence: 0 },
        { key: "attempts", label: "Attempts", value_numeric: 9, unit: "count", sequence: 1 },
      ],
    });
    expect(invalid["measurements.attempts.value_numeric"]).toContain("configured total attempts");
    expect(invalid["measurements.successes.value_numeric"]).toBe("Cannot exceed attempts");
  });

  it("requires null elapsed time for non-timed attempts", () => {
    const fields = validateAttemptAgainstDefinition(
      definition({ type: "count", direction: "higher", unit: "reps" }),
      {
        attempt_number: 1,
        elapsed_ms: 1000,
        measurements: [{ key: "count", label: "Count", value_numeric: 12, unit: "reps", sequence: 0 }],
      },
    );
    expect(fields.elapsed_ms).toBe("Must be null for non-timed results");
  });

  it("validates distance and count value shapes", () => {
    expect(validateAttemptAgainstDefinition(
      definition({ type: "distance", direction: "higher", unit: "in" }),
      {
        attempt_number: 1,
        elapsed_ms: null,
        measurements: [{ key: "distance", label: "Distance", value_numeric: 72.5, unit: "in", sequence: 0 }],
      },
    )).toEqual({});

    const countFields = validateAttemptAgainstDefinition(
      definition({ type: "count", direction: "higher", unit: "reps" }),
      {
        attempt_number: 1,
        elapsed_ms: null,
        measurements: [{ key: "count", label: "Count", value_numeric: 3.5, unit: "reps", sequence: 0 }],
      },
    );
    expect(countFields["measurements.count.value_numeric"]).toContain("integer");
  });

  it("enforces rating range and step", () => {
    const drill = definition({ type: "rating", direction: "higher", unit: "score", min: 1, max: 5, step: 0.5 });
    expect(validateAttemptAgainstDefinition(drill, {
      attempt_number: 1,
      elapsed_ms: null,
      measurements: [{ key: "rating", label: "Rating", value_numeric: 4.5, unit: "score", sequence: 0 }],
    })).toEqual({});

    const fields = validateAttemptAgainstDefinition(drill, {
      attempt_number: 1,
      elapsed_ms: null,
      measurements: [{ key: "rating", label: "Rating", value_numeric: 4.2, unit: "score", sequence: 0 }],
    });
    expect(fields["measurements.rating.value_numeric"]).toContain("step of 0.5");
  });

  it("requires the exact configured custom numeric fields", () => {
    const drill = definition({
      type: "custom_numeric",
      direction: "higher",
      fields: [
        { key: "accuracy", label: "Accuracy", unit: "points" },
        { key: "speed", label: "Speed", unit: "mph" },
      ],
    });
    expect(validateAttemptAgainstDefinition(drill, {
      attempt_number: 1,
      elapsed_ms: null,
      measurements: [
        { key: "accuracy", label: "Accuracy", value_numeric: 8, unit: "points", sequence: 0 },
        { key: "speed", label: "Speed", value_numeric: 14.2, unit: "mph", sequence: 1 },
      ],
    })).toEqual({});

    const fields = validateAttemptAgainstDefinition(drill, {
      attempt_number: 1,
      elapsed_ms: null,
      measurements: [{ key: "accuracy", label: "Accuracy", value_numeric: 8, unit: "points", sequence: 0 }],
    });
    expect(fields["measurements.speed"]).toBe("Required");
  });
});

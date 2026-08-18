import type { DrillDefinition } from "../drills/definition";

export type AttemptMeasurementForValidation = {
  key: string;
  label: string;
  value_numeric: number | null;
  value_text?: string | null;
  unit: string | null;
  sequence: number;
};

export type AttemptForValidation = {
  attempt_number: number;
  elapsed_ms: number | null;
  measurements: AttemptMeasurementForValidation[];
};

function addCommonErrors(definition: DrillDefinition, input: AttemptForValidation, fields: Record<string, string>) {
  if (!Number.isInteger(input.attempt_number) || input.attempt_number < 1 || input.attempt_number > definition.attempts.count) {
    fields.attempt_number = `Must be between 1 and ${definition.attempts.count}`;
  }

  const seen = new Set<string>();
  input.measurements.forEach((measurement, index) => {
    if (seen.has(measurement.key)) fields[`measurements.${index}.key`] = "Measurement keys must be unique";
    seen.add(measurement.key);
  });
}

function byKey(input: AttemptForValidation) {
  return new Map(input.measurements.map((measurement) => [measurement.key, measurement]));
}

function requireExactKeys(
  input: AttemptForValidation,
  expected: Array<{ key: string; label: string; unit: string | null }>,
  fields: Record<string, string>,
) {
  const expectedByKey = new Map(expected.map((item) => [item.key, item]));
  const actual = byKey(input);

  for (const item of expected) {
    const measurement = actual.get(item.key);
    if (!measurement) {
      fields[`measurements.${item.key}`] = "Required";
      continue;
    }
    if (measurement.label !== item.label) fields[`measurements.${item.key}.label`] = `Must be ${item.label}`;
    if (measurement.unit !== item.unit) fields[`measurements.${item.key}.unit`] = `Must use ${item.unit ?? "no unit"}`;
  }

  input.measurements.forEach((measurement, index) => {
    if (!expectedByKey.has(measurement.key)) fields[`measurements.${index}.key`] = "Unexpected measurement key";
  });
}

function numericValue(
  input: AttemptForValidation,
  key: string,
  fields: Record<string, string>,
): number | null {
  const value = byKey(input).get(key)?.value_numeric;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fields[`measurements.${key}.value_numeric`] = "Must be a finite number";
    return null;
  }
  return value;
}

function validateTime(definition: DrillDefinition, input: AttemptForValidation, fields: Record<string, string>) {
  const elapsedMs = input.elapsed_ms;
  if (typeof elapsedMs !== "number" || !Number.isInteger(elapsedMs) || elapsedMs <= 0) {
    fields.elapsed_ms = "Must be a positive integer millisecond value";
    return;
  }

  const configuredSplits = new Map((definition.timer?.splits ?? []).map((split) => [split.key, split]));
  let totalTimeCount = 0;

  input.measurements.forEach((measurement, index) => {
    if (measurement.key === "total_time") {
      totalTimeCount += 1;
      if (measurement.label !== "Total Time") fields[`measurements.${index}.label`] = "Must be Total Time";
      if (measurement.unit !== "ms") fields[`measurements.${index}.unit`] = "Timed values use ms";
      if (measurement.value_numeric !== elapsedMs) fields[`measurements.${index}.value_numeric`] = "Must equal elapsed_ms";
      return;
    }

    const split = configuredSplits.get(measurement.key);
    if (!split) {
      fields[`measurements.${index}.key`] = "Unknown split key";
      return;
    }
    if (measurement.label !== split.label) fields[`measurements.${index}.label`] = `Must be ${split.label}`;
    if (measurement.unit !== "ms") fields[`measurements.${index}.unit`] = "Timed splits use ms";
    if (!Number.isInteger(measurement.value_numeric) || (measurement.value_numeric ?? 0) <= 0) {
      fields[`measurements.${index}.value_numeric`] = "Split must be a positive integer millisecond value";
    } else if ((measurement.value_numeric ?? 0) > elapsedMs) {
      fields[`measurements.${index}.value_numeric`] = "Split cannot exceed total time";
    }
  });

  if (totalTimeCount !== 1) fields.measurements = "Exactly one total_time measurement is required";
}

function validateSuccessesAttempts(definition: DrillDefinition, input: AttemptForValidation, fields: Record<string, string>) {
  if (input.elapsed_ms !== null) fields.elapsed_ms = "Must be null for non-timed results";
  const unit = definition.measurement.unit ?? "count";
  requireExactKeys(input, [
    { key: "successes", label: "Successes", unit },
    { key: "attempts", label: "Attempts", unit },
  ], fields);

  const successes = numericValue(input, "successes", fields);
  const attempts = numericValue(input, "attempts", fields);
  const configuredAttempts = definition.measurement.total_attempts;

  if (successes !== null && !Number.isInteger(successes)) fields["measurements.successes.value_numeric"] = "Must be an integer";
  if (attempts !== null && !Number.isInteger(attempts)) fields["measurements.attempts.value_numeric"] = "Must be an integer";
  if (attempts !== null && configuredAttempts !== undefined && attempts !== configuredAttempts) {
    fields["measurements.attempts.value_numeric"] = `Must equal configured total attempts (${configuredAttempts})`;
  }
  if (attempts !== null && attempts <= 0) fields["measurements.attempts.value_numeric"] = "Must be greater than zero";
  if (successes !== null && successes < 0) fields["measurements.successes.value_numeric"] = "Must be zero or greater";
  if (successes !== null && attempts !== null && successes > attempts) {
    fields["measurements.successes.value_numeric"] = "Cannot exceed attempts";
  }
}

function validateDistance(definition: DrillDefinition, input: AttemptForValidation, fields: Record<string, string>) {
  if (input.elapsed_ms !== null) fields.elapsed_ms = "Must be null for non-timed results";
  requireExactKeys(input, [{ key: "distance", label: "Distance", unit: definition.measurement.unit ?? null }], fields);
  const distance = numericValue(input, "distance", fields);
  if (distance !== null && distance < 0) fields["measurements.distance.value_numeric"] = "Must be zero or greater";
}

function validateCount(definition: DrillDefinition, input: AttemptForValidation, fields: Record<string, string>) {
  if (input.elapsed_ms !== null) fields.elapsed_ms = "Must be null for non-timed results";
  requireExactKeys(input, [{ key: "count", label: "Count", unit: definition.measurement.unit ?? null }], fields);
  const count = numericValue(input, "count", fields);
  if (count !== null && (!Number.isInteger(count) || count < 0)) {
    fields["measurements.count.value_numeric"] = "Must be an integer zero or greater";
  }
}

function validateRating(definition: DrillDefinition, input: AttemptForValidation, fields: Record<string, string>) {
  if (input.elapsed_ms !== null) fields.elapsed_ms = "Must be null for non-timed results";
  requireExactKeys(input, [{ key: "rating", label: "Rating", unit: definition.measurement.unit ?? null }], fields);
  const rating = numericValue(input, "rating", fields);
  if (rating === null) return;

  const min = definition.measurement.min;
  const max = definition.measurement.max;
  const step = definition.measurement.step;
  if (min !== undefined && rating < min) fields["measurements.rating.value_numeric"] = `Must be at least ${min}`;
  if (max !== undefined && rating > max) fields["measurements.rating.value_numeric"] = `Must be at most ${max}`;
  if (min !== undefined && step !== undefined && step > 0) {
    const steps = (rating - min) / step;
    if (Math.abs(steps - Math.round(steps)) > 1e-9) {
      fields["measurements.rating.value_numeric"] = `Must align to a step of ${step}`;
    }
  }
}

function validateCustomNumeric(definition: DrillDefinition, input: AttemptForValidation, fields: Record<string, string>) {
  if (input.elapsed_ms !== null) fields.elapsed_ms = "Must be null for non-timed results";
  const configured = definition.measurement.fields ?? [];
  requireExactKeys(
    input,
    configured.map((field) => ({ key: field.key, label: field.label, unit: field.unit })),
    fields,
  );
  configured.forEach((field) => {
    numericValue(input, field.key, fields);
  });
}

export function validateAttemptAgainstDefinition(
  definition: DrillDefinition,
  input: AttemptForValidation,
): Record<string, string> {
  const fields: Record<string, string> = {};
  addCommonErrors(definition, input, fields);

  switch (definition.measurement.type) {
    case "time":
      validateTime(definition, input, fields);
      break;
    case "successes_attempts":
      validateSuccessesAttempts(definition, input, fields);
      break;
    case "distance":
      validateDistance(definition, input, fields);
      break;
    case "count":
      validateCount(definition, input, fields);
      break;
    case "rating":
      validateRating(definition, input, fields);
      break;
    case "custom_numeric":
      validateCustomNumeric(definition, input, fields);
      break;
  }

  return fields;
}

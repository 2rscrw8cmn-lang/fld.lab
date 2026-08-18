import type { AttemptMeasurement, DrillDefinition } from "@/lib/api";

export type ManualValues = Record<string, string>;

export type ManualResult =
  | { ok: true; measurements: AttemptMeasurement[]; summary: string }
  | { ok: false; error: string };

function parseNumber(values: ManualValues, key: string, label: string): number | string {
  const text = values[key]?.trim() ?? "";
  if (!text) return `${label} is required.`;
  const value = Number(text);
  return Number.isFinite(value) ? value : `${label} must be a number.`;
}

function withUnit(value: number, unit: string | undefined) {
  return unit ? `${value} ${unit}` : `${value}`;
}

export function initialManualValues(definition: DrillDefinition): ManualValues {
  if (definition.measurement.type === "successes_attempts") {
    return { successes: "", attempts: String(definition.measurement.total_attempts ?? "") };
  }
  return {};
}

export function buildManualResult(definition: DrillDefinition, values: ManualValues): ManualResult {
  const measurement = definition.measurement;

  if (measurement.type === "time") return { ok: false, error: "Timed drills use the stopwatch." };

  if (measurement.type === "successes_attempts") {
    const successes = parseNumber(values, "successes", "Successes");
    if (typeof successes === "string") return { ok: false, error: successes };
    const attempts = measurement.total_attempts;
    if (!Number.isInteger(successes) || successes < 0) return { ok: false, error: "Successes must be a whole number zero or greater." };
    if (!Number.isInteger(attempts) || (attempts ?? 0) <= 0) return { ok: false, error: "This drill does not have a valid total attempt count." };
    if (successes > attempts!) return { ok: false, error: `Successes cannot exceed ${attempts}.` };
    const unit = measurement.unit ?? "count";
    return {
      ok: true,
      measurements: [
        { key: "successes", label: "Successes", value_numeric: successes, value_text: null, unit, sequence: 0 },
        { key: "attempts", label: "Attempts", value_numeric: attempts!, value_text: null, unit, sequence: 1 },
      ],
      summary: `${successes}/${attempts}`,
    };
  }

  if (measurement.type === "distance") {
    const distance = parseNumber(values, "distance", "Distance");
    if (typeof distance === "string") return { ok: false, error: distance };
    if (distance < 0) return { ok: false, error: "Distance must be zero or greater." };
    return {
      ok: true,
      measurements: [
        { key: "distance", label: "Distance", value_numeric: distance, value_text: null, unit: measurement.unit ?? null, sequence: 0 },
      ],
      summary: withUnit(distance, measurement.unit),
    };
  }

  if (measurement.type === "count") {
    const count = parseNumber(values, "count", "Count");
    if (typeof count === "string") return { ok: false, error: count };
    if (!Number.isInteger(count) || count < 0) return { ok: false, error: "Count must be a whole number zero or greater." };
    return {
      ok: true,
      measurements: [
        { key: "count", label: "Count", value_numeric: count, value_text: null, unit: measurement.unit ?? null, sequence: 0 },
      ],
      summary: withUnit(count, measurement.unit),
    };
  }

  if (measurement.type === "rating") {
    const rating = parseNumber(values, "rating", "Rating");
    if (typeof rating === "string") return { ok: false, error: rating };
    const min = measurement.min;
    const max = measurement.max;
    const step = measurement.step;
    if (min !== undefined && rating < min) return { ok: false, error: `Rating must be at least ${min}.` };
    if (max !== undefined && rating > max) return { ok: false, error: `Rating must be at most ${max}.` };
    if (min !== undefined && step !== undefined && step > 0) {
      const steps = (rating - min) / step;
      if (Math.abs(steps - Math.round(steps)) > 1e-9) return { ok: false, error: `Rating must use increments of ${step}.` };
    }
    return {
      ok: true,
      measurements: [
        { key: "rating", label: "Rating", value_numeric: rating, value_text: null, unit: measurement.unit ?? null, sequence: 0 },
      ],
      summary: max !== undefined ? `${rating}/${max}` : withUnit(rating, measurement.unit),
    };
  }

  const fields = measurement.fields ?? [];
  const measurements: AttemptMeasurement[] = [];
  const summary: string[] = [];
  for (const [index, field] of fields.entries()) {
    const value = parseNumber(values, field.key, field.label);
    if (typeof value === "string") return { ok: false, error: value };
    measurements.push({
      key: field.key,
      label: field.label,
      value_numeric: value,
      value_text: null,
      unit: field.unit,
      sequence: index,
    });
    summary.push(`${field.label} ${withUnit(value, field.unit)}`);
  }
  if (!measurements.length) return { ok: false, error: "This drill has no numeric fields configured." };
  return { ok: true, measurements, summary: summary.join(" · ") };
}

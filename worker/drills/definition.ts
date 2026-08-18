import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";

import drillDefinitionSchema from "../../schemas/drill-definition.schema.json";

export type MeasurementType =
  | "time"
  | "successes_attempts"
  | "distance"
  | "count"
  | "rating"
  | "custom_numeric";

export type DrillDefinition = {
  schema_version: 1;
  slug: string;
  name: string;
  category: string;
  icon?: string;
  description?: string;
  instructions?: string;
  measurement: {
    type: MeasurementType;
    direction: "lower" | "higher" | "none";
    unit?: string;
    total_attempts?: number;
    min?: number;
    max?: number;
    step?: number;
    fields?: Array<{ key: string; label: string; unit: string }>;
  };
  attempts: {
    count: number;
    result: "best" | "average" | "latest" | "total";
  };
  timer?: {
    enabled: boolean;
    splits: Array<{ key: string; label: string }>;
  };
  equipment?: string[];
  tags?: string[];
  positions?: string[];
  setup?: {
    distance_yards?: number;
    notes?: string;
  };
};

export type DrillValidationResult =
  | { ok: true; definition: DrillDefinition; canonicalJson: string }
  | { ok: false; fields: Record<string, string> };

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(drillDefinitionSchema);

function fieldPath(error: ErrorObject): string {
  const base = error.instancePath
    .split("/")
    .filter(Boolean)
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .join(".");

  if (error.keyword === "required") {
    const missing = (error.params as { missingProperty?: string }).missingProperty;
    return [base, missing].filter(Boolean).join(".") || "definition";
  }

  if (error.keyword === "additionalProperties") {
    const extra = (error.params as { additionalProperty?: string }).additionalProperty;
    return [base, extra].filter(Boolean).join(".") || "definition";
  }

  return base || "definition";
}

function schemaErrors(errors: ErrorObject[] | null | undefined): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const error of errors ?? []) {
    const path = fieldPath(error);
    if (!fields[path]) fields[path] = error.message ?? "Invalid value";
  }
  return fields;
}

function semanticErrors(definition: DrillDefinition): Record<string, string> {
  const fields: Record<string, string> = {};

  if (definition.measurement.type !== "time" && definition.timer?.enabled) {
    fields["timer.enabled"] = "Timer may only be enabled for time measurements";
  }

  if (definition.timer) {
    const splitKeys = new Set<string>();
    definition.timer.splits.forEach((split, index) => {
      if (splitKeys.has(split.key)) fields[`timer.splits.${index}.key`] = "Split keys must be unique";
      splitKeys.add(split.key);
    });
  }

  if (definition.measurement.type === "rating") {
    const { min, max, step } = definition.measurement;
    if (typeof min === "number" && typeof max === "number" && min >= max) {
      fields["measurement.max"] = "Maximum must be greater than minimum";
    }
    if (
      typeof min === "number" &&
      typeof max === "number" &&
      typeof step === "number" &&
      step > max - min
    ) {
      fields["measurement.step"] = "Step must not exceed the rating range";
    }
  }

  if (definition.measurement.type === "custom_numeric") {
    const keys = new Set<string>();
    (definition.measurement.fields ?? []).forEach((field, index) => {
      if (keys.has(field.key)) fields[`measurement.fields.${index}.key`] = "Field keys must be unique";
      keys.add(field.key);
    });
  }

  return fields;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sortValue(child)]),
    );
  }
  return value;
}

export function canonicalizeDrillDefinition(definition: DrillDefinition): string {
  return JSON.stringify(sortValue(definition));
}

export function validateDrillDefinition(value: unknown): DrillValidationResult {
  if (!validateSchema(value)) {
    return { ok: false, fields: schemaErrors(validateSchema.errors) };
  }

  const definition = value as DrillDefinition;
  const fields = semanticErrors(definition);
  if (Object.keys(fields).length) return { ok: false, fields };

  return {
    ok: true,
    definition,
    canonicalJson: canonicalizeDrillDefinition(definition),
  };
}

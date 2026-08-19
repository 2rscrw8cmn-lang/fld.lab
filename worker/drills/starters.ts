import type { D1Database } from "@cloudflare/workers-types";

import sprint20 from "../../drills/starter/20-yard-sprint.json";
import shuttle505 from "../../drills/starter/5-10-5-shuttle.json";
import sprint50 from "../../drills/starter/50-yard-sprint.json";
import highJump from "../../drills/starter/high-jump.json";
import lDrill from "../../drills/starter/l-drill.json";
import longJump from "../../drills/starter/long-jump.json";
import quickCatch from "../../drills/starter/quick-catch-10.json";
import tDrill from "../../drills/starter/t-drill.json";
import throwDistance from "../../drills/starter/throw-distance.json";
import { getDrill, importDrill, type Drill, type DrillDetail } from "../db/drills";
import { validateDrillDefinition, type DrillDefinition } from "./definition";

type StarterDrill = {
  definition: DrillDefinition;
  canonicalJson: string;
};

const rawStarters: unknown[] = [
  quickCatch,
  sprint20,
  sprint50,
  shuttle505,
  lDrill,
  tDrill,
  highJump,
  longJump,
  throwDistance,
];

const FEET_UPGRADE_SLUGS = new Set(["long-jump", "throw-distance"]);

function validatedStarter(value: unknown): StarterDrill {
  const result = validateDrillDefinition(value);
  if (!result.ok) {
    throw new Error(`Invalid starter drill definition: ${JSON.stringify(result.fields)}`);
  }
  return { definition: result.definition, canonicalJson: result.canonicalJson };
}

export const STARTER_DRILLS: readonly StarterDrill[] = rawStarters.map(validatedStarter);

export function missingStarterDrills(existing: Pick<Drill, "slug">[]): readonly StarterDrill[] {
  const existingSlugs = new Set(existing.map((drill) => drill.slug));
  return STARTER_DRILLS.filter((starter) => !existingSlugs.has(starter.definition.slug));
}

function shouldUpgradeStarterUnits(detail: DrillDetail, starter: StarterDrill) {
  if (!FEET_UPGRADE_SLUGS.has(starter.definition.slug)) return false;
  if (detail.version.version !== 1) return false;
  return (
    detail.version.definition.measurement.type === "distance" &&
    detail.version.definition.measurement.unit === "in" &&
    starter.definition.measurement.type === "distance" &&
    starter.definition.measurement.unit === "ft"
  );
}

export async function seedMissingStarterDrills(
  db: D1Database,
  existing: Pick<Drill, "id" | "slug">[],
): Promise<number> {
  const bySlug = new Map(existing.map((drill) => [drill.slug, drill]));
  let changes = 0;

  for (const starter of STARTER_DRILLS) {
    const current = bySlug.get(starter.definition.slug);
    if (!current) {
      await importDrill(db, starter.definition, starter.canonicalJson);
      changes += 1;
      continue;
    }

    // The original v1 starter catalog recorded these two drills in inches.
    // Upgrade only that known v1 shape; later coach-authored versions are left alone.
    if (FEET_UPGRADE_SLUGS.has(starter.definition.slug)) {
      const detail = await getDrill(db, current.id);
      if (shouldUpgradeStarterUnits(detail, starter)) {
        await importDrill(db, starter.definition, starter.canonicalJson);
        changes += 1;
      }
    }
  }

  return changes;
}

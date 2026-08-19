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
import { importDrill, type Drill } from "../db/drills";
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

export async function seedMissingStarterDrills(
  db: D1Database,
  existing: Pick<Drill, "slug">[],
): Promise<number> {
  const missing = missingStarterDrills(existing);
  for (const starter of missing) {
    await importDrill(db, starter.definition, starter.canonicalJson);
  }
  return missing.length;
}

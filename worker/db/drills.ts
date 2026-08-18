import type { D1Database } from "@cloudflare/workers-types";

import type { DrillDefinition } from "../drills/definition";
import { RepositoryError } from "./repository";

export type Drill = {
  id: string;
  slug: string;
  name: string;
  category: string;
  icon: string | null;
  measurement_type: string;
  active: boolean;
  current_version_id: string;
  current_version: number;
  created_at: string;
  updated_at: string;
};

export type DrillVersion = {
  id: string;
  drill_id: string;
  version: number;
  definition: DrillDefinition;
  created_at: string;
};

export type DrillDetail = {
  drill: Drill;
  version: DrillVersion;
};

export type DrillImportResult = DrillDetail & {
  created: boolean;
  version_created: boolean;
};

type DrillDbRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  icon: string | null;
  measurement_type: string;
  active: number;
  current_version_id: string | null;
  current_version: number | null;
  created_at: string;
  updated_at: string;
};

type VersionDbRow = {
  id: string;
  drill_id: string;
  version: number;
  definition_json: string;
  created_at: string;
};

const nowIso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function drillFromRow(row: DrillDbRow): Drill {
  if (!row.current_version_id || row.current_version === null) {
    throw new Error(`Drill ${row.id} has no current version.`);
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    icon: row.icon,
    measurement_type: row.measurement_type,
    active: row.active === 1,
    current_version_id: row.current_version_id,
    current_version: row.current_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function versionFromRow(row: VersionDbRow): DrillVersion {
  return {
    id: row.id,
    drill_id: row.drill_id,
    version: row.version,
    definition: JSON.parse(row.definition_json) as DrillDefinition,
    created_at: row.created_at,
  };
}

const drillSelect = `SELECT
  d.id,
  d.slug,
  d.name,
  d.category,
  d.icon,
  d.measurement_type,
  d.active,
  d.current_version_id,
  dv.version AS current_version,
  d.created_at,
  d.updated_at
FROM drills d
JOIN drill_versions dv ON dv.id = d.current_version_id`;

export async function listDrills(db: D1Database): Promise<Drill[]> {
  const result = await db
    .prepare(`${drillSelect} WHERE d.active = 1 ORDER BY d.category, d.name`)
    .all<DrillDbRow>();
  return result.results.map(drillFromRow);
}

export async function getDrill(db: D1Database, drillId: string): Promise<DrillDetail> {
  const row = await db
    .prepare(`${drillSelect} WHERE d.id = ?`)
    .bind(drillId)
    .first<DrillDbRow>();
  if (!row) throw new RepositoryError("not_found", "Drill not found.");

  const drill = drillFromRow(row);
  const versionRow = await db
    .prepare("SELECT * FROM drill_versions WHERE id = ? AND drill_id = ?")
    .bind(drill.current_version_id, drill.id)
    .first<VersionDbRow>();
  if (!versionRow) throw new Error(`Current version ${drill.current_version_id} was not found.`);

  return { drill, version: versionFromRow(versionRow) };
}

async function getDrillBySlug(db: D1Database, slug: string): Promise<DrillDetail | null> {
  const row = await db
    .prepare(`${drillSelect} WHERE d.slug = ?`)
    .bind(slug)
    .first<DrillDbRow>();
  if (!row) return null;

  const drill = drillFromRow(row);
  const versionRow = await db
    .prepare("SELECT * FROM drill_versions WHERE id = ?")
    .bind(drill.current_version_id)
    .first<VersionDbRow>();
  if (!versionRow) throw new Error(`Current version ${drill.current_version_id} was not found.`);
  return { drill, version: versionFromRow(versionRow) };
}

export async function importDrill(
  db: D1Database,
  definition: DrillDefinition,
  canonicalJson: string,
): Promise<DrillImportResult> {
  const existing = await getDrillBySlug(db, definition.slug);
  const timestamp = nowIso();

  if (!existing) {
    const drillId = id("drill");
    const versionId = id("drill_version");

    await db.batch([
      db
        .prepare(
          `INSERT INTO drills
            (id, slug, name, category, icon, measurement_type, active, current_version_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)`,
        )
        .bind(
          drillId,
          definition.slug,
          definition.name,
          definition.category,
          definition.icon ?? null,
          definition.measurement.type,
          timestamp,
          timestamp,
        ),
      db
        .prepare(
          "INSERT INTO drill_versions (id, drill_id, version, definition_json, created_at) VALUES (?, ?, 1, ?, ?)",
        )
        .bind(versionId, drillId, canonicalJson, timestamp),
      db
        .prepare("UPDATE drills SET current_version_id = ? WHERE id = ?")
        .bind(versionId, drillId),
    ]);

    return {
      ...(await getDrill(db, drillId)),
      created: true,
      version_created: true,
    };
  }

  const currentRow = await db
    .prepare("SELECT definition_json FROM drill_versions WHERE id = ?")
    .bind(existing.drill.current_version_id)
    .first<{ definition_json: string }>();
  if (!currentRow) throw new Error(`Current version ${existing.drill.current_version_id} was not found.`);

  if (currentRow.definition_json === canonicalJson) {
    return { ...existing, created: false, version_created: false };
  }

  const nextVersion = existing.drill.current_version + 1;
  const versionId = id("drill_version");
  await db.batch([
    db
      .prepare(
        "INSERT INTO drill_versions (id, drill_id, version, definition_json, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(versionId, existing.drill.id, nextVersion, canonicalJson, timestamp),
    db
      .prepare(
        `UPDATE drills
         SET name = ?, category = ?, icon = ?, measurement_type = ?, current_version_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        definition.name,
        definition.category,
        definition.icon ?? null,
        definition.measurement.type,
        versionId,
        timestamp,
        existing.drill.id,
      ),
  ]);

  return {
    ...(await getDrill(db, existing.drill.id)),
    created: false,
    version_created: true,
  };
}

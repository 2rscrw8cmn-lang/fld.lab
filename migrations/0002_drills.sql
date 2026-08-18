PRAGMA foreign_keys = ON;

CREATE TABLE drills (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  icon TEXT,
  measurement_type TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  current_version_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE drill_versions (
  id TEXT PRIMARY KEY,
  drill_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  definition_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT drill_versions_drill_fk FOREIGN KEY (drill_id) REFERENCES drills(id),
  CONSTRAINT drill_versions_drill_version_unique UNIQUE (drill_id, version)
);

CREATE UNIQUE INDEX idx_drills_slug ON drills(slug);
CREATE INDEX idx_drills_active_category ON drills(active, category, name);
CREATE INDEX idx_drill_versions_drill_version ON drill_versions(drill_id, version DESC);

-- SQLite allows this circular relationship only after both tables exist.
-- Keep the current-version pointer nullable during the initial insert, then set it in the same D1 batch.
CREATE TRIGGER validate_drills_current_version_update
BEFORE UPDATE OF current_version_id ON drills
WHEN NEW.current_version_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM drill_versions
      WHERE id = NEW.current_version_id AND drill_id = NEW.id
    ) THEN RAISE(ABORT, 'current_version_id must belong to drill')
  END;
END;

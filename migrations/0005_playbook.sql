PRAGMA foreign_keys = ON;

CREATE TABLE plays (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('offense', 'defense')),
  formation_id TEXT,
  formation TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  diagram_json TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE INDEX idx_plays_team_active_updated
  ON plays (team_id, archived, updated_at DESC);

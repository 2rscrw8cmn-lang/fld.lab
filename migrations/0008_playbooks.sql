PRAGMA foreign_keys = ON;

CREATE TABLE playbooks (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('5v5', '6v6')),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE INDEX idx_playbooks_team_archived_updated
  ON playbooks (team_id, archived, updated_at DESC);

INSERT INTO playbooks (id, team_id, name, format, archived, created_at, updated_at)
SELECT
  'playbook_default_' || id,
  id,
  '5v5 Playbook',
  '5v5',
  0,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM teams;

ALTER TABLE plays ADD COLUMN playbook_id TEXT;

UPDATE plays
SET playbook_id = 'playbook_default_' || team_id
WHERE playbook_id IS NULL;

CREATE INDEX idx_plays_playbook_active_updated
  ON plays (playbook_id, archived, active_play, updated_at DESC);

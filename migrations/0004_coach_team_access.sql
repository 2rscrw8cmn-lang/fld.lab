PRAGMA foreign_keys = ON;

CREATE TABLE coaches (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE team_coaches (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  coach_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'coach')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT team_coaches_team_fk FOREIGN KEY (team_id) REFERENCES teams(id),
  CONSTRAINT team_coaches_coach_fk FOREIGN KEY (coach_id) REFERENCES coaches(id),
  CONSTRAINT team_coaches_team_coach_unique UNIQUE (team_id, coach_id)
);

CREATE INDEX idx_coaches_email ON coaches(email);
CREATE INDEX idx_team_coaches_coach_active ON team_coaches(coach_id, active);
CREATE INDEX idx_team_coaches_team_active ON team_coaches(team_id, active);
CREATE INDEX idx_team_coaches_team_role_active ON team_coaches(team_id, role, active);

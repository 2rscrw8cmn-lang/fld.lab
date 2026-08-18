PRAGMA foreign_keys = ON;

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  age_group TEXT,
  season_label TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE athletes (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_year INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE team_memberships (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  jersey_number TEXT,
  primary_position TEXT,
  secondary_position TEXT,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT team_memberships_team_fk FOREIGN KEY (team_id) REFERENCES teams(id),
  CONSTRAINT team_memberships_athlete_fk FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT team_memberships_team_athlete_unique UNIQUE (team_id, athlete_id)
);

CREATE INDEX idx_teams_active ON teams(active);
CREATE INDEX idx_athletes_status ON athletes(status);
CREATE INDEX idx_team_memberships_team_active ON team_memberships(team_id, active);
CREATE INDEX idx_team_memberships_athlete ON team_memberships(athlete_id);

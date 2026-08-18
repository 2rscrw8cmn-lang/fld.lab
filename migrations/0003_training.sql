PRAGMA foreign_keys = ON;

CREATE TABLE training_sessions (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  drill_id TEXT NOT NULL,
  drill_version_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT training_sessions_team_fk FOREIGN KEY (team_id) REFERENCES teams(id),
  CONSTRAINT training_sessions_drill_fk FOREIGN KEY (drill_id) REFERENCES drills(id),
  CONSTRAINT training_sessions_drill_version_fk FOREIGN KEY (drill_version_id) REFERENCES drill_versions(id)
);

CREATE TABLE session_athletes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  order_index INTEGER NOT NULL CHECK (order_index >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'complete', 'skipped')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT session_athletes_session_fk FOREIGN KEY (session_id) REFERENCES training_sessions(id),
  CONSTRAINT session_athletes_athlete_fk FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT session_athletes_session_athlete_unique UNIQUE (session_id, athlete_id),
  CONSTRAINT session_athletes_session_order_unique UNIQUE (session_id, order_index)
);

CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  client_attempt_id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  started_at TEXT,
  stopped_at TEXT,
  elapsed_ms INTEGER CHECK (elapsed_ms IS NULL OR elapsed_ms >= 0),
  valid INTEGER NOT NULL DEFAULT 1 CHECK (valid IN (0, 1)),
  note TEXT,
  request_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT attempts_session_fk FOREIGN KEY (session_id) REFERENCES training_sessions(id),
  CONSTRAINT attempts_athlete_fk FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT attempts_session_athlete_number_unique UNIQUE (session_id, athlete_id, attempt_number)
);

CREATE TABLE measurements (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  value_numeric REAL,
  value_text TEXT,
  unit TEXT,
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  CONSTRAINT measurements_attempt_fk FOREIGN KEY (attempt_id) REFERENCES attempts(id),
  CONSTRAINT measurements_attempt_key_unique UNIQUE (attempt_id, key)
);

CREATE INDEX idx_training_sessions_team_started ON training_sessions(team_id, started_at DESC);
CREATE INDEX idx_training_sessions_drill_started ON training_sessions(drill_id, started_at DESC);
CREATE INDEX idx_training_sessions_team_status ON training_sessions(team_id, status);
CREATE INDEX idx_session_athletes_session_order ON session_athletes(session_id, order_index);
CREATE INDEX idx_attempts_session_athlete ON attempts(session_id, athlete_id);
CREATE INDEX idx_attempts_athlete_created ON attempts(athlete_id, created_at DESC);
CREATE INDEX idx_measurements_attempt_key ON measurements(attempt_id, key);

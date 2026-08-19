PRAGMA foreign_keys = ON;

CREATE TABLE play_personnel (
  play_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (play_id, player_id),
  CONSTRAINT play_personnel_play_fk FOREIGN KEY (play_id) REFERENCES plays(id) ON DELETE CASCADE,
  CONSTRAINT play_personnel_athlete_fk FOREIGN KEY (athlete_id) REFERENCES athletes(id)
);

CREATE INDEX idx_play_personnel_athlete ON play_personnel(athlete_id);

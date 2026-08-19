ALTER TABLE plays ADD COLUMN active_play INTEGER NOT NULL DEFAULT 1 CHECK (active_play IN (0, 1));
ALTER TABLE plays ADD COLUMN play_type TEXT NOT NULL DEFAULT 'pass' CHECK (play_type IN ('pass', 'run', 'option'));
ALTER TABLE plays ADD COLUMN concept TEXT NOT NULL DEFAULT '';
ALTER TABLE plays ADD COLUMN situation TEXT NOT NULL DEFAULT 'any' CHECK (situation IN ('any', 'short', 'medium', 'deep', 'no-run', 'goal-line', 'conversion'));

CREATE INDEX idx_plays_team_active_play_updated
  ON plays (team_id, archived, active_play, updated_at DESC);

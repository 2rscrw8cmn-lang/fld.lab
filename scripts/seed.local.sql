INSERT OR IGNORE INTO teams (
  id, name, age_group, season_label, active, created_at, updated_at
) VALUES (
  'team_u10_purple_fall_2026', 'U10 Purple', 'U10', 'Fall 2026', 1,
  '2026-08-18T12:00:00.000Z', '2026-08-18T12:00:00.000Z'
);

INSERT OR IGNORE INTO athletes (
  id, first_name, last_name, birth_year, status, notes, created_at, updated_at
) VALUES
  ('athlete_emma_johnson', 'Emma', 'Johnson', 2017, 'active', NULL, '2026-08-18T12:00:00.000Z', '2026-08-18T12:00:00.000Z'),
  ('athlete_mia_carter', 'Mia', 'Carter', 2017, 'active', NULL, '2026-08-18T12:00:00.000Z', '2026-08-18T12:00:00.000Z'),
  ('athlete_ava_smith', 'Ava', 'Smith', 2017, 'active', NULL, '2026-08-18T12:00:00.000Z', '2026-08-18T12:00:00.000Z'),
  ('athlete_zoey_davis', 'Zoey', 'Davis', 2017, 'active', NULL, '2026-08-18T12:00:00.000Z', '2026-08-18T12:00:00.000Z'),
  ('athlete_nora_reed', 'Nora', 'Reed', 2017, 'active', NULL, '2026-08-18T12:00:00.000Z', '2026-08-18T12:00:00.000Z');

INSERT OR IGNORE INTO team_memberships (
  id, team_id, athlete_id, jersey_number, primary_position, secondary_position,
  joined_at, left_at, active, created_at, updated_at
) VALUES
  ('membership_emma_u10_purple', 'team_u10_purple_fall_2026', 'athlete_emma_johnson', '12', 'WR', 'DB', '2026-08-18T12:00:00.000Z', NULL, 1, '2026-08-18T12:00:00.000Z', '2026-08-18T12:00:00.000Z'),
  ('membership_mia_u10_purple', 'team_u10_purple_fall_2026', 'athlete_mia_carter', '7', 'QB', 'DB', '2026-08-18T12:00:00.000Z', NULL, 1, '2026-08-18T12:00:00.000Z', '2026-08-18T12:00:00.000Z'),
  ('membership_ava_u10_purple', 'team_u10_purple_fall_2026', 'athlete_ava_smith', '3', 'C', 'WR', '2026-08-18T12:00:00.000Z', NULL, 1, '2026-08-18T12:00:00.000Z', '2026-08-18T12:00:00.000Z'),
  ('membership_zoey_u10_purple', 'team_u10_purple_fall_2026', 'athlete_zoey_davis', '18', 'WR', NULL, '2026-08-18T12:00:00.000Z', NULL, 1, '2026-08-18T12:00:00.000Z', '2026-08-18T12:00:00.000Z'),
  ('membership_nora_u10_purple', 'team_u10_purple_fall_2026', 'athlete_nora_reed', '4', 'DB', NULL, '2026-08-18T12:00:00.000Z', NULL, 1, '2026-08-18T12:00:00.000Z', '2026-08-18T12:00:00.000Z');

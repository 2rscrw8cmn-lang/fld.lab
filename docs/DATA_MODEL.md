# fld.LAB — Data Model

## 1. Purpose

The data model must support:

- multiple teams over time
- athletes participating in different teams/seasons without losing history
- configurable and versioned drills
- one coach running a drill for many athletes
- multiple attempts per athlete
- timed splits and non-timed measurements
- durable historical results

The initial database target is Cloudflare D1.

## 2. MVP decisions

These are no longer open questions for the first release.

### Team is season-specific

For MVP, a `Team` represents a roster for a specific season or period, for example:

```text
U10 Purple — Fall 2026
```

Do **not** create a separate `Season` entity yet. If future requirements need seasons to contain multiple teams, add that relationship deliberately later.

### Athlete owns identity; membership owns roster details

`Athlete` stores identity that should survive team changes.

`TeamMembership` stores roster-specific information such as:

- jersey number
- primary position
- secondary position

This prevents a future jersey or position change from rewriting prior roster history.

### Splits are measurements

Do **not** create a separate `splits` table for MVP.

Timed splits are stored as `Measurement` rows attached to an `Attempt`, using keys such as:

```text
split_10yd
split_20yd
```

This keeps timed and non-timed result data in one extensible measurement model.

---

## 3. Core entities

### Team

A season-specific roster group.

Suggested fields:

- `id`
- `name` — e.g. `U10 Purple`
- `age_group` — optional
- `season_label` — e.g. `Fall 2026`
- `active`
- `created_at`
- `updated_at`

### Athlete

One person independent of any team membership.

Suggested fields:

- `id`
- `first_name`
- `last_name`
- `birth_year` — optional
- `status` — `active | inactive`
- `notes` — optional
- `created_at`
- `updated_at`

Do not use athlete name, jersey number, or team assignment as an identifier.

Do not store the current jersey number or position directly on `Athlete` for MVP; those belong to `TeamMembership`.

### TeamMembership

Associates an athlete with one team/season.

Suggested fields:

- `id`
- `team_id`
- `athlete_id`
- `jersey_number` — optional
- `primary_position` — optional
- `secondary_position` — optional
- `joined_at`
- `left_at` — nullable
- `active`
- `created_at`
- `updated_at`

Recommended constraint:

```text
UNIQUE(team_id, athlete_id)
```

An athlete changing jersey number or position should update the membership record for that team. Historical session/result records continue to reference the stable athlete and session context.

### Drill

Stable identity for a drill concept.

Suggested fields:

- `id`
- `slug`
- `name`
- `category`
- `active`
- `current_version_id`
- `created_at`
- `updated_at`

`slug` is the stable imported-drill identity and should be unique.

### DrillVersion

Immutable configuration used to render and score a drill.

Suggested fields:

- `id`
- `drill_id`
- `version`
- `definition_json`
- `created_at`

Rules:

- Never mutate a `DrillVersion` after it has been used by a recorded session.
- Importing a changed definition creates a new version.
- `Drill.current_version_id` points at the latest active definition.

### TrainingSession

One run of one drill with one team.

Suggested fields:

- `id`
- `team_id`
- `drill_id`
- `drill_version_id`
- `started_at`
- `completed_at` — nullable
- `status` — `active | completed | abandoned`
- `notes` — optional
- `created_by` — nullable until authentication is implemented
- `created_at`
- `updated_at`

MVP rule:

> One `TrainingSession` = one drill + one team.

A session always retains the exact `drill_version_id` used when it began.

### SessionAthlete

Snapshot of the athlete queue/participation for a session.

Suggested fields:

- `id`
- `session_id`
- `athlete_id`
- `order_index`
- `status` — `pending | active | complete | skipped`
- `created_at`
- `updated_at`

This supports fast athlete switching, `Save + Next`, skipping, and resuming a session.

### Attempt

One recorded attempt by one athlete in one session.

Suggested fields:

- `id`
- `session_id`
- `athlete_id`
- `attempt_number`
- `started_at` — optional informational timestamp
- `stopped_at` — optional informational timestamp
- `elapsed_ms` — optional convenience value for a timed attempt
- `valid`
- `note` — optional
- `created_at`
- `updated_at`

Store authoritative timed values as integer milliseconds.

`started_at` and `stopped_at` are not used to reconstruct stopwatch accuracy. The browser calculates elapsed time with a monotonic clock before persistence.

### Measurement

Typed values attached to an attempt.

Suggested fields:

- `id`
- `attempt_id`
- `key`
- `label`
- `value_numeric` — nullable
- `value_text` — nullable
- `unit` — nullable
- `sequence`
- `created_at`

Examples:

| Drill | key | value | unit |
|---|---|---:|---|
| 20-Yard Sprint | `total_time` | 4180 | `ms` |
| 20-Yard Sprint | `split_10yd` | 2210 | `ms` |
| Catching | `successes` | 8 | `count` |
| Catching | `attempts` | 10 | `count` |
| Broad Jump | `distance` | 72 | `in` |
| Route Execution | `rating` | 4 | `score_1_5` |

For timed drills, `elapsed_ms` may duplicate the primary total-time measurement for query convenience, but the application must treat the two consistently. Do not create a second split-specific storage model.

---

## 4. Relationships

```text
Team
  └── TeamMembership ── Athlete

Drill
  └── DrillVersion

TrainingSession
  ├── Team
  ├── Drill
  ├── DrillVersion
  └── SessionAthlete ── Athlete
                         └── Attempt
                              └── Measurement
```

---

## 5. Result calculation

The authoritative stored layer is:

- session
- athlete
- attempt
- measurement

Derived values should initially be calculated rather than duplicated as authoritative records:

- personal best
- latest result
- average
- team average
- leaderboard rank
- percentage change

Optimize only after real query patterns require it.

## 6. Personal-best rules

The drill definition determines result direction:

- sprint/shuttle time → lower is better
- catches/accuracy/count → higher is better
- throwing/jump distance → higher is better
- subjective/no-ranking measurements → none

Only valid attempts count toward PBs and leaderboards.

When a drill defines multiple attempts, its configured aggregation (`best`, `average`, `latest`, or `total`) determines the athlete's displayed result for that session.

## 7. Deletion and archival

Prefer archival over deletion whenever history exists.

- athlete with history → mark inactive
- membership → mark inactive/end membership
- drill with history → archive
- team with history → archive
- completed session → delete only as an explicit corrective action

Never silently cascade-delete performance history.

## 8. Privacy minimization

Needed for MVP:

- athlete name
- roster/team context
- optional birth year
- training results

Not needed initially:

- home address
- parent contact details
- medical information
- school information
- full date of birth

Real athlete data must not be placed on a publicly accessible production deployment until access control is implemented. See `SECURITY.md`.

## 9. Initial indexing priorities

Likely indexes:

- `team_memberships(team_id, active)`
- `team_memberships(athlete_id)`
- `training_sessions(team_id, started_at)`
- `training_sessions(drill_id, started_at)`
- `session_athletes(session_id, order_index)`
- `attempts(session_id, athlete_id)`
- `attempts(athlete_id, created_at)`
- `measurements(attempt_id, key)`

Do not add speculative indexes beyond actual access patterns.

## 10. Deferred decisions

These can wait until a real requirement appears:

- separate `Season` entity
- organizations/clubs above teams
- athlete photos
- parent/player accounts
- result correction audit log
- multi-drill practice containers

Do not block the first usable release on these.
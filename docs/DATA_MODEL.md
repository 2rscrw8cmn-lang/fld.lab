# fld.LAB — Data Model

## 1. Goals

The data model should support:

- multiple teams
- athletes moving between teams/seasons without losing history
- configurable/versioned drills
- training sessions containing many athletes
- multiple attempts per athlete
- timed splits and non-timed measurements
- durable historical results

The initial database target is Cloudflare D1.

## 2. Core entities

### Team
Represents a roster group such as `U10 Blue`.

Suggested fields:
- `id`
- `name`
- `age_group` — optional
- `season_label` — optional
- `active`
- `created_at`
- `updated_at`

### Athlete
Represents one player independent of any specific result.

Suggested fields:
- `id`
- `first_name`
- `last_name`
- `jersey_number` — optional
- `primary_position` — optional
- `secondary_position` — optional
- `birth_year` — optional
- `status` — `active | inactive`
- `notes` — optional
- `created_at`
- `updated_at`

Do not use jersey number or name as the primary key.

### TeamMembership
Associates an athlete with a team/season while preserving history.

Suggested fields:
- `id`
- `team_id`
- `athlete_id`
- `jersey_number_override` — optional
- `position_override` — optional
- `joined_at`
- `left_at` — nullable
- `active`

This allows the same athlete to move between teams or seasons without creating a new athlete record.

### Drill
Stable identity for a drill concept.

Examples:
- 20-Yard Sprint
- 5-10-5 Shuttle
- QB Accuracy

Suggested fields:
- `id`
- `slug`
- `name`
- `category`
- `active`
- `current_version_id`
- `created_at`
- `updated_at`

### DrillVersion
Immutable configuration used to render and score a drill.

Suggested fields:
- `id`
- `drill_id`
- `version`
- `definition_json`
- `created_at`

Important rule: **never mutate a historical DrillVersion in place.** Importing a changed definition creates a new version and updates `Drill.current_version_id`.

### TrainingSession
Represents one execution of one drill with one team at a point in time.

Suggested fields:
- `id`
- `team_id`
- `drill_id`
- `drill_version_id`
- `started_at`
- `completed_at` — nullable
- `status` — `active | completed | abandoned`
- `notes` — optional
- `created_by` — future auth reference; nullable for early MVP
- `created_at`
- `updated_at`

A session should always retain the exact `drill_version_id` used when it was run.

### SessionAthlete
Tracks participation/order in a session.

Suggested fields:
- `id`
- `session_id`
- `athlete_id`
- `order_index`
- `status` — `pending | active | complete | skipped`
- `created_at`
- `updated_at`

This supports fast Next Athlete behavior and resuming a session.

### Attempt
One recorded attempt by one athlete in one session.

Suggested fields:
- `id`
- `session_id`
- `athlete_id`
- `attempt_number`
- `started_at` — optional
- `stopped_at` — optional
- `elapsed_ms` — optional for timed drills
- `valid`
- `note` — optional
- `created_at`
- `updated_at`

Store timed results internally in integer milliseconds. Format into seconds only for display.

### Measurement
Stores typed values attached to an attempt.

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

## 3. Relationships

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

## 4. Result calculation

Do not store every derived statistic as authoritative data.

The raw authoritative layer is:
- session
- athlete
- attempt
- measurement

Derived values include:
- personal best
- latest result
- average
- team average
- leaderboard rank
- percentage change

These can initially be calculated in queries/application code and optimized later if needed.

## 5. Personal-best rules

The drill definition determines whether higher or lower is better.

Examples:
- sprint time: lower is better
- shuttle time: lower is better
- catches: higher is better
- throwing distance: higher is better
- accuracy percentage: higher is better

Only valid attempts should count toward PBs unless a future drill explicitly defines another rule.

## 6. Deletion and archival

Prefer archival over deletion for data that has history.

- athlete with results → mark inactive; do not hard-delete by default
- drill with results → archive; do not hard-delete
- team with history → archive
- session results → deletion should be an explicit corrective action, not normal cleanup

## 7. Privacy / minimization

The MVP should intentionally avoid storing unnecessary youth-athlete personal data.

Needed for product operation:
- athlete name
- jersey / team context
- optional position / birth year
- training results

Not needed initially:
- home address
- parent contact details
- medical information
- school information
- full date of birth

## 8. Initial indexing priorities

Likely useful indexes:
- `team_memberships(team_id, active)`
- `training_sessions(team_id, started_at)`
- `training_sessions(drill_id, started_at)`
- `session_athletes(session_id, order_index)`
- `attempts(session_id, athlete_id)`
- `attempts(athlete_id, created_at)`
- `measurements(attempt_id, key)`

Do not prematurely optimize beyond real query needs.

## 9. Open decisions

Confirm during implementation:
- whether teams and seasons should be separate entities
- authentication model
- whether athlete photos are needed
- whether result corrections need an audit log
- whether sessions must support more than one drill in a single session container

For the MVP, prefer **one TrainingSession = one drill run with one team**. It keeps the field workflow and data model simple.

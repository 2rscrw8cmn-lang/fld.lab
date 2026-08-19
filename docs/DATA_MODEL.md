# fld.LAB — Data Model

## 1. Purpose

The data model must support:

- multiple coaches with separate authenticated identities
- explicit coach access to teams
- multiple teams over time
- athletes participating in different teams/seasons without losing history
- configurable and versioned drills
- one coach running a drill for many athletes
- multiple attempts per athlete
- timed splits and non-timed measurements
- durable historical results

The database target is Cloudflare D1.

## 2. Current decisions

### Cloudflare Access owns login; D1 owns team authorization

Cloudflare Access verifies who the coach is. fld.LAB stores a minimal `Coach` record keyed by normalized email and uses `TeamCoach` membership to determine which teams that identity may use.

The production email allowlist is an eligibility gate, not permission to every team.

### Team is season-specific

For the current product, a `Team` represents a roster for a specific season or period, for example:

```text
U10 Purple — Fall 2026
```

Do **not** create a separate `Season` entity yet.

### Athlete owns identity; membership owns roster details

`Athlete` stores identity that should survive team changes.

`TeamMembership` stores roster-specific information such as:

- jersey number
- primary position
- secondary position

This prevents a future jersey or position change from rewriting prior roster history.

### Splits are measurements

Do **not** create a separate `splits` table.

Timed splits are stored as `Measurement` rows attached to an `Attempt`, using keys such as:

```text
split_10yd
split_20yd
```

This keeps timed and non-timed result data in one extensible measurement model.

---

## 3. Core entities

### Coach

Minimal application identity created from a cryptographically verified Cloudflare Access identity.

Fields:

- `id`
- `email` — normalized, case-insensitive unique
- `display_name` — optional/future-friendly
- `created_at`
- `updated_at`

Rules:

- do not store passwords, OTPs, Access tokens, or signing keys
- do not hard-code production coach emails in migrations or source
- the verified Access email is the authoritative mapping key

### TeamCoach

Authorizes one Coach to one Team.

Fields:

- `id`
- `team_id`
- `coach_id`
- `role` — `owner | coach`
- `active`
- `created_at`
- `updated_at`

Constraint:

```text
UNIQUE(team_id, coach_id)
```

Role rules:

- `owner` can use the team and manage team details/sharing
- `coach` can use roster, Train, Data, and team-scoped history but cannot edit/archive/share the team
- team access removal is a soft deactivation
- a team must retain at least one active owner

Migration/bootstrap rule for Phase 6A:

> Any Team that existed before `team_coaches` was introduced and has no TeamCoach rows is shared with every email currently in the production authorized-coach allowlist as `owner`.

This preserves the existing shared-team behavior during the transition without embedding account-specific values in the public repository. New teams do **not** use this bootstrap; the creating Coach becomes the sole owner until access is explicitly shared.

### Team

A season-specific roster group.

Fields:

- `id`
- `name`
- `age_group` — optional
- `season_label` — optional
- `active`
- `created_at`
- `updated_at`

Team does not contain an `owner_id`; ownership is many-to-many through `TeamCoach` so more than one owner can exist.

### Athlete

One person independent of any team membership.

Fields:

- `id`
- `first_name`
- `last_name`
- `birth_year` — optional
- `status` — `active | inactive`
- `notes` — optional
- `created_at`
- `updated_at`

Do not use athlete name, jersey number, or team assignment as an identifier.

Do not store current jersey number or position directly on `Athlete`; those belong to `TeamMembership`.

An Athlete may be referenced across multiple teams only when an authorized coach explicitly reuses that existing athlete record. Identity edits therefore affect every membership pointing at that Athlete.

### TeamMembership

Associates an athlete with one team/season.

Fields:

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

Constraint:

```text
UNIQUE(team_id, athlete_id)
```

An athlete changing jersey number or position updates the membership record for that team. Historical session/result records continue to reference the stable athlete and session context.

### Drill

Stable identity for a drill concept.

Fields:

- `id`
- `slug`
- `name`
- `category`
- `active`
- `current_version_id`
- `created_at`
- `updated_at`

`slug` is the stable imported-drill identity and should be unique.

Drills remain deployment-wide configuration in Phase 6A rather than team-owned records.

### DrillVersion

Immutable configuration used to render and score a drill.

Fields:

- `id`
- `drill_id`
- `version`
- `definition_json`
- `created_at`

Rules:

- never mutate a `DrillVersion` after it has been used by a recorded session
- importing a changed definition creates a new version
- `Drill.current_version_id` points at the latest active definition

### TrainingSession

One run of one drill with one team.

Fields:

- `id`
- `team_id`
- `drill_id`
- `drill_version_id`
- `started_at`
- `completed_at` — nullable
- `status` — `active | completed | abandoned`
- `notes` — optional
- `created_by` — Coach id for sessions created after Phase 6A
- `created_at`
- `updated_at`

`created_by` remains nullable for legacy rows because the column predates coach identity and historical sessions cannot always be attributed reliably.

Rule:

> One `TrainingSession` = one drill + one team.

A session always retains the exact `drill_version_id` used when it began.

The stored status `abandoned` corresponds to **Quit** in the coach-facing UI. Quit sessions remain stored but do not contribute to performance analytics.

### SessionAthlete

Snapshot of the athlete queue/participation for a session.

Fields:

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

Fields:

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

Fields:

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
| Long Jump | `distance` | 6.0 | `ft` |
| Throw Distance | `distance` | 72 | `ft` |
| Route Execution | `rating` | 4 | `score_1_5` |

For timed drills, `elapsed_ms` may duplicate the primary total-time measurement for query convenience, but the application must treat the two consistently. Do not create a second split-specific storage model.

---

## 4. Relationships

```text
Coach
  └── TeamCoach ── Team
                    └── TeamMembership ── Athlete

Drill
  └── DrillVersion

TrainingSession
  ├── Team
  ├── Coach (created_by, nullable for legacy rows)
  ├── Drill
  ├── DrillVersion
  └── SessionAthlete ── Athlete
                         └── Attempt
                              └── Measurement
```

---

## 5. Authorization boundary

Every team-scoped read or mutation must establish the authenticated Coach's active `TeamCoach` membership before reading the resource.

Important derived-resource checks:

- roster → authorize team
- membership mutation → resolve membership's team, then authorize
- athlete results → require explicit accessible `team_id` and athlete membership in that team
- session/attempt/status routes → resolve session's team, then authorize
- leaderboard/trend/session history → authorize requested team
- team edit/archive/sharing → require `owner`

A browser-supplied resource ID never grants access by itself.

Prefer `404` for a team-scoped resource outside the coach's accessible scope so IDs cannot be used to enumerate other teams.

---

## 6. Result calculation

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

Performance analytics use valid attempts from **completed sessions only**.

Optimize only after real query patterns require it.

## 7. Personal-best rules

The drill definition determines result direction:

- sprint/shuttle time → lower is better
- catches/accuracy/count → higher is better
- throwing/jump distance → higher is better
- subjective/no-ranking measurements → none

Only valid completed-session results count toward PBs and leaderboards.

When a drill defines multiple attempts, its configured aggregation (`best`, `average`, `latest`, or `total`) determines the athlete's displayed result for that session.

Archived team memberships stay in historical athlete/session data but do not appear in the current team leaderboard.

## 8. Deletion and archival

Prefer archival over deletion whenever history exists.

- coach team access → deactivate TeamCoach
- athlete with history → mark inactive
- membership → mark inactive/end membership
- drill with history → archive
- team with history → archive
- completed session → delete only as an explicit corrective action

Never silently cascade-delete performance history.

## 9. Privacy minimization

Needed:

- coach email required for identity/authorization
- athlete name
- roster/team context
- optional birth year
- training results

Not needed initially:

- coach passwords or OTPs
- athlete home address
- parent contact details
- medical information
- school information
- full date of birth

Real athlete data requires the production Access + Worker JWT gate and D1 team authorization described in `SECURITY.md`.

## 10. Indexing priorities

Current/likely indexes:

- `coaches(email)`
- `team_coaches(coach_id, active)`
- `team_coaches(team_id, active)`
- `team_coaches(team_id, role, active)`
- `team_memberships(team_id, active)`
- `team_memberships(athlete_id)`
- `training_sessions(team_id, started_at)`
- `training_sessions(drill_id, started_at)`
- `session_athletes(session_id, order_index)`
- `attempts(session_id, athlete_id)`
- `attempts(athlete_id, created_at)`
- `measurements(attempt_id, key)`

Do not add speculative indexes beyond actual access patterns.

## 11. Deferred decisions

These can wait until a real requirement appears:

- separate `Season` entity
- organizations/clubs above teams
- automated email invitations
- owner-transfer workflow
- more granular team roles
- athlete photos
- parent/player accounts
- result correction audit log
- multi-drill practice containers

Do not turn the minimal team-authorization layer into a larger organization/account system until field use proves the need.

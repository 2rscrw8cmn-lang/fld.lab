# fld.LAB — API Contract

This document defines the HTTP contract between the React client and the Cloudflare Worker.

The API is intentionally small. Add endpoints only when a product workflow needs them.

## 1. General conventions

Base path:

```text
/api
```

Content type:

```text
application/json
```

IDs are opaque strings. The client must not infer meaning from ID format.

Timestamps are UTC ISO-8601 strings, for example:

```text
2026-08-18T01:30:00.000Z
```

Timed performance values are integer milliseconds. Non-timed attempts use `elapsed_ms: null`; their authoritative values live in Measurement rows defined by the session's immutable drill definition.

## 2. Authentication

Authentication provider/mechanism is intentionally not fixed yet.

Local/mock development may operate without authentication.

Before real production use, all athlete/team endpoints must require authorized access as defined in `SECURITY.md`.

The route shapes in this document should remain usable after authentication is added.

## 3. Error format

All non-2xx API errors return:

```json
{
  "error": {
    "code": "validation_error",
    "message": "One or more fields are invalid.",
    "fields": {
      "first_name": "Required"
    }
  }
}
```

`fields` is optional.

Common codes:

```text
validation_error
not_found
conflict
unauthorized
forbidden
invalid_drill_definition
active_session_conflict
internal_error
```

Do not expose SQL errors, stack traces, tokens, or internal Cloudflare details to the client.

## 4. Status codes

Use conventional meanings:

- `200` — successful read/update or idempotent retry returning existing resource
- `201` — resource created
- `204` — successful action with no response body when appropriate
- `400` — malformed request / validation failure
- `401` — authentication required
- `403` — authenticated but not authorized
- `404` — resource not found in accessible scope
- `409` — state/uniqueness conflict
- `422` — structurally valid request that cannot satisfy drill/schema rules, when useful
- `500` — unexpected server failure

## 5. Health

### `GET /api/health`

Response:

```json
{
  "ok": true
}
```

This route must not expose sensitive environment details.

---

# Phase 1 — Teams + Roster

## 6. Team resource

```json
{
  "id": "team_123",
  "name": "U10 Purple",
  "age_group": "U10",
  "season_label": "Fall 2026",
  "active": true,
  "created_at": "2026-08-18T01:30:00.000Z",
  "updated_at": "2026-08-18T01:30:00.000Z"
}
```

For MVP, Team is season-specific.

## 7. List teams

### `GET /api/teams`

Response:

```json
{
  "teams": []
}
```

Default behavior returns active teams.

## 8. Create team

### `POST /api/teams`

Request:

```json
{
  "name": "U10 Purple",
  "age_group": "U10",
  "season_label": "Fall 2026"
}
```

Response: `201` with Team resource.

Validation:

- `name` required
- `age_group` optional
- `season_label` optional but recommended

## 9. Update/archive team

### `PATCH /api/teams/:teamId`

Request may contain:

```json
{
  "name": "U10 Purple",
  "age_group": "U10",
  "season_label": "Fall 2026",
  "active": false
}
```

Archiving does not delete roster or result history.

## 10. Athlete identity resource

```json
{
  "id": "athlete_123",
  "first_name": "Emma",
  "last_name": "Johnson",
  "birth_year": 2017,
  "status": "active",
  "notes": null,
  "created_at": "2026-08-18T01:30:00.000Z",
  "updated_at": "2026-08-18T01:30:00.000Z"
}
```

Athlete identity does **not** contain jersey number or positions for MVP.

## 11. Team membership resource

```json
{
  "id": "membership_123",
  "team_id": "team_123",
  "athlete_id": "athlete_123",
  "jersey_number": "12",
  "primary_position": "WR",
  "secondary_position": "DB",
  "joined_at": "2026-08-18T01:30:00.000Z",
  "left_at": null,
  "active": true,
  "created_at": "2026-08-18T01:30:00.000Z",
  "updated_at": "2026-08-18T01:30:00.000Z"
}
```

## 12. Roster row resource

Roster endpoints return identity + membership together for display convenience:

```json
{
  "athlete": {
    "id": "athlete_123",
    "first_name": "Emma",
    "last_name": "Johnson",
    "birth_year": 2017,
    "status": "active",
    "notes": null
  },
  "membership": {
    "id": "membership_123",
    "team_id": "team_123",
    "jersey_number": "12",
    "primary_position": "WR",
    "secondary_position": "DB",
    "active": true
  }
}
```

This response shape does not change database ownership.

## 13. Get roster

### `GET /api/teams/:teamId/roster`

Default response includes active memberships only:

```json
{
  "team_id": "team_123",
  "roster": []
}
```

`?include_inactive=true` includes archived memberships.

## 14. Add athlete to roster

### `POST /api/teams/:teamId/roster`

The common MVP flow creates a new Athlete and TeamMembership together:

```json
{
  "athlete": {
    "first_name": "Emma",
    "last_name": "Johnson",
    "birth_year": 2017,
    "notes": null
  },
  "membership": {
    "jersey_number": "12",
    "primary_position": "WR",
    "secondary_position": "DB"
  }
}
```

Response: `201` with Roster Row resource.

Server behavior:

1. validate identity + membership
2. create Athlete
3. create TeamMembership
4. commit together
5. return combined row

If membership creation fails, do not leave an orphaned Athlete.

To add an existing athlete to another team:

```json
{
  "athlete_id": "athlete_123",
  "membership": {
    "jersey_number": "7",
    "primary_position": "QB",
    "secondary_position": null
  }
}
```

Exactly one of `athlete` or `athlete_id` must be provided. Existing membership on the same team returns `409 conflict`.

## 15. Update athlete identity

### `PATCH /api/athletes/:athleteId`

Allowed MVP fields:

```json
{
  "first_name": "Emma",
  "last_name": "Johnson",
  "birth_year": 2017,
  "status": "active",
  "notes": "Optional coach note"
}
```

Do not accept jersey number or position here.

## 16. Update/archive membership

### `PATCH /api/team-memberships/:membershipId`

Allowed fields:

```json
{
  "jersey_number": "12",
  "primary_position": "WR",
  "secondary_position": "DB",
  "active": false
}
```

Archiving may set `left_at`; reactivation may clear it. Never delete athlete history.

---

# Phase 2 — Drills

## 17. Drill list

### `GET /api/drills`

Response:

```json
{
  "drills": []
}
```

Each row includes enough metadata for the library: id, slug, name, category, icon, measurement type, current version, and active state.

## 18. Drill detail

### `GET /api/drills/:drillId`

Returns stable Drill metadata plus its current DrillVersion definition.

Historical sessions always read their stored `drill_version_id`; never substitute the current version for old results.

## 19. Import drill

### `POST /api/drills/import`

Request body is the drill definition JSON itself.

Server validates against `schemas/drill-definition.schema.json` and applies `DRILL_SPEC.md` semantic/versioning rules.

- new drill → `201`
- changed definition for existing slug → `201` with new immutable version
- identical current definition → may return `200` with existing version

Invalid definition:

```json
{
  "error": {
    "code": "invalid_drill_definition",
    "message": "The drill definition is invalid.",
    "fields": {
      "measurement.type": "Unsupported measurement type"
    }
  }
}
```

---

# Phase 3 — Training

## 20. Create session

### `POST /api/sessions`

Request:

```json
{
  "team_id": "team_123",
  "drill_id": "drill_123"
}
```

Server behavior:

1. confirm team/drill access and active state
2. snapshot the drill's current `drill_version_id`
3. create TrainingSession
4. create ordered SessionAthlete rows from active roster membership
5. return session + athlete queue + exact definition

All v1 measurement types supported by `DRILL_SPEC.md` may start a session.

Response `201`:

```json
{
  "session": {
    "id": "session_123",
    "team_id": "team_123",
    "drill_id": "drill_123",
    "drill_version_id": "drill_version_2",
    "status": "active",
    "started_at": "2026-08-18T01:30:00.000Z"
  },
  "drill_definition": {},
  "athletes": [],
  "attempts": []
}
```

## 21. Get/resume session

### `GET /api/sessions/:sessionId`

Returns:

- session
- exact drill definition version
- athlete queue/order
- SessionAthlete statuses
- persisted attempts and measurements needed to resume

### `GET /api/teams/:teamId/active-session`

Returns the team's active SessionDetail, or `null` when no active session exists.

## 22. Update session

### `PATCH /api/sessions/:sessionId`

Allowed status transitions:

```text
active → completed
active → abandoned
```

Every session athlete must be complete or skipped before completion. Already-saved attempts remain when a session is abandoned.

## 23. Persist attempt

### `POST /api/sessions/:sessionId/attempts`

Every attempt uses the same envelope. The Measurement rows vary by the session's immutable drill definition.

### Timed example

```json
{
  "client_attempt_id": "01J...",
  "athlete_id": "athlete_123",
  "attempt_number": 1,
  "started_at": "2026-08-18T01:35:00.000Z",
  "stopped_at": "2026-08-18T01:35:04.180Z",
  "elapsed_ms": 4180,
  "valid": true,
  "note": null,
  "measurements": [
    {
      "key": "total_time",
      "label": "Total Time",
      "value_numeric": 4180,
      "value_text": null,
      "unit": "ms",
      "sequence": 0
    },
    {
      "key": "split_10yd",
      "label": "10 yd",
      "value_numeric": 2210,
      "value_text": null,
      "unit": "ms",
      "sequence": 1
    }
  ]
}
```

For `time`, `elapsed_ms` is a positive integer millisecond value. Split values are elapsed milliseconds from the original Start.

### Non-timed example — successes / attempts

```json
{
  "client_attempt_id": "01J...",
  "athlete_id": "athlete_123",
  "attempt_number": 1,
  "started_at": null,
  "stopped_at": null,
  "elapsed_ms": null,
  "valid": true,
  "note": null,
  "measurements": [
    {
      "key": "successes",
      "label": "Successes",
      "value_numeric": 8,
      "value_text": null,
      "unit": "count",
      "sequence": 0
    },
    {
      "key": "attempts",
      "label": "Attempts",
      "value_numeric": 10,
      "value_text": null,
      "unit": "count",
      "sequence": 1
    }
  ]
}
```

For every non-timed measurement type, `elapsed_ms`, `started_at`, and `stopped_at` are `null` in the normal manual-entry flow.

Authoritative measurement shapes:

- `successes_attempts` → `successes` + `attempts`; both integers, attempts equals configured `total_attempts`, and `0 <= successes <= attempts`
- `distance` → `distance` using the configured unit; value is zero or greater
- `count` → `count` using the configured unit; value is an integer zero or greater
- `rating` → `rating` using configured unit/min/max/step
- `custom_numeric` → exactly one numeric Measurement for every configured field key/label/unit

Rules for all attempt types:

- `client_attempt_id` is required and unique for idempotent retry
- athlete must belong to the session queue and not be skipped
- attempt number must be valid for the drill
- measurement keys, labels, units, values, and ranges must match the session's immutable drill definition
- timed elapsed/split values are captured by the browser; the server never retimes them
- attempt + measurements persist transactionally
- first successful create → `201`
- retry with the same `client_attempt_id` and same payload → `200` existing attempt
- same client ID with different data → `409 conflict`

This prevents network retries from duplicating results.

## 24. Session athlete status

### `PATCH /api/sessions/:sessionId/athletes/:athleteId`

Used for explicit participation state such as skip/unskip:

```json
{
  "status": "skipped"
}
```

Do not represent skipped athletes with a zero-valued attempt.

## 24A. Add roster athletes to an active session

### `POST /api/sessions/:sessionId/athletes`

Allows a coach to explicitly append active team members who were rostered after the session snapshot was created.

Request:

```json
{
  "athlete_ids": ["athlete_456", "athlete_789"]
}
```

Server rules:

- session must still be active
- each requested athlete must be an active roster member of the session's team
- existing session athletes are left unchanged
- repeated requests are idempotent for athletes already present
- new athletes append to the queue as `pending`
- response is refreshed SessionDetail

---

# Phase 4 — Results

## 25. Athlete results

### `GET /api/athletes/:athleteId/results`

Expected filters:

```text
?drill_id=<id>
?team_id=<id>
?from=<iso-date>
?to=<iso-date>
```

Response should include raw session result history plus derived values needed by the UI, such as PB/latest, without making derived values authoritative database records.

## 26. Drill leaderboard

### `GET /api/drills/:drillId/leaderboard?team_id=:teamId`

Rank according to drill `direction`:

- `lower` → ascending
- `higher` → descending
- `none` → no ranked leaderboard

Only valid attempts/results count.

## 27. Validation boundary

Client validation improves UX. Server validation is authoritative.

Never trust:

- athlete/team IDs from browser without access checks
- drill definitions just because client validation passed
- elapsed or measurement values to match a different drill's expected schema
- archived/inactive relationships without explicit server rules

## 28. API evolution

When changing a request/response contract:

1. update this document
2. update shared TypeScript schemas/types if present
3. update tests
4. update affected UX/spec docs when behavior changes

Do not quietly create alternate shapes for the same resource in different screens.

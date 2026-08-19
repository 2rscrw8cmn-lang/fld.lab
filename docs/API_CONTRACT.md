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

## 2. Authentication + authorization

Production identity is provided by Cloudflare Access. Every protected `/api/*` request is verified by the Worker as described in `AUTH.md` and `SECURITY.md`.

Authorization has two layers:

1. the verified email must be present in the deployment `AUTHORIZED_COACH_EMAILS` allowlist
2. team-scoped data requires an active `team_coaches` membership for the authenticated Coach

A client-supplied team, athlete, membership, or session ID is never proof of access. Inaccessible team-scoped resources should normally return `404` so the API does not reveal whether another coach's resource exists. Owner-only mutations return `403` when the signed-in coach has team access but lacks the `owner` role.

Cloudflare Access remains the login provider; fld.LAB does not store passwords.

Local development may use the explicit localhost-only development identity described in `AUTH.md`.

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
auth_unavailable
internal_error
```

Do not expose SQL errors, stack traces, tokens, or internal Cloudflare details to the client.

## 4. Status codes

Use conventional meanings:

- `200` — successful read/update or idempotent retry returning existing resource
- `201` — resource created
- `400` — malformed request / validation failure
- `401` — authentication required
- `403` — authenticated but not authorized for the requested action
- `404` — resource not found in the coach's accessible scope
- `409` — state/uniqueness conflict
- `422` — structurally valid request that cannot satisfy drill/schema rules, when useful
- `500` — unexpected server failure
- `503` — authentication/authorization infrastructure unavailable or required permission schema not deployed

## 5. Health + identity

### `GET /api/health`

Response:

```json
{
  "ok": true
}
```

This route is public and must not expose sensitive environment details.

### `GET /api/auth/me`

Protected. Returns only the verified operator identity needed by the UI:

```json
{
  "coach": {
    "email": "coach@example.com",
    "provider": "cloudflare-access"
  }
}
```

---

# Phase 1 — Teams + Roster

## 6. Team resource

Team list/create/update responses include the signed-in coach's access role:

```json
{
  "id": "team_123",
  "name": "U10 Purple",
  "age_group": "U10",
  "season_label": "Fall 2026",
  "active": true,
  "access_role": "owner",
  "created_at": "2026-08-18T01:30:00.000Z",
  "updated_at": "2026-08-18T01:30:00.000Z"
}
```

`access_role` is `owner | coach`.

For MVP, Team is season-specific.

## 7. List teams

### `GET /api/teams`

Returns only active teams for which the signed-in coach has active team access:

```json
{
  "teams": []
}
```

### `GET /api/team-admin/teams`

Returns the signed-in coach's active and archived teams for Settings. It never returns teams the coach does not belong to.

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

Response: `201` with Team resource and `access_role: "owner"`.

Server behavior:

1. create Team
2. create an active `team_coaches` row for the authenticated Coach
3. assign role `owner`
4. return the owned Team

Validation:

- `name` required
- `age_group` optional
- `season_label` optional but recommended

## 9. Update/archive team

### `PATCH /api/teams/:teamId`

Requires `owner` role.

Request may contain:

```json
{
  "name": "U10 Purple",
  "age_group": "U10",
  "season_label": "Fall 2026",
  "active": false
}
```

Archiving does not delete roster, coach membership, session, or result history.

## 9A. Team coach access

### `GET /api/teams/:teamId/coaches`

Requires team access. Returns active coach memberships:

```json
{
  "coaches": [
    {
      "id": "coach_123",
      "email": "coach@example.com",
      "display_name": null,
      "role": "owner"
    }
  ]
}
```

### `POST /api/teams/:teamId/coaches`

Requires `owner` role.

```json
{
  "email": "second-coach@example.com"
}
```

The target email must already be in the deployment's authorized coach allowlist. This endpoint grants team access; it does not change Cloudflare Access policy or Worker secrets. Newly added memberships use role `coach`.

### `DELETE /api/teams/:teamId/coaches/:coachId`

Requires `owner` role. Soft-deactivates the target team membership and returns:

```json
{
  "removed": true
}
```

Rules:

- a coach cannot remove their own access through this v1 endpoint
- the last active owner cannot be removed
- removing access never deletes historical data

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

Athlete identity does **not** contain jersey number or positions.

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

## 13. Get roster

### `GET /api/teams/:teamId/roster`

Requires access to `:teamId`.

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

Requires access to `:teamId`.

The common flow creates a new Athlete and TeamMembership together:

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

1. validate team access + identity + membership
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

The coach must already have access to the referenced Athlete through another accessible team. Exactly one of `athlete` or `athlete_id` must be provided. Existing membership on the same team returns `409 conflict`.

## 15. Update athlete identity

### `PATCH /api/athletes/:athleteId`

The athlete must belong to at least one team accessible to the signed-in coach.

Allowed fields:

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

Requires access to the membership's team.

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

Drill definitions are deployment-wide configuration in Phase 6A rather than team-owned resources. Any authenticated/allowlisted coach may read the shared drill library and import a versioned drill definition.

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

All session routes require access to the session's team. Supplying a session ID from another coach's team must not bypass authorization.

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

1. confirm signed-in coach has team access and team/drill are active
2. snapshot the drill's current `drill_version_id`
3. create TrainingSession
4. store the authenticated Coach id in `created_by`
5. create ordered SessionAthlete rows from active roster membership
6. return session + athlete queue + exact definition

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
    "started_at": "2026-08-18T01:30:00.000Z",
    "created_by": "coach_123"
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

Allowed stored status transitions:

```text
active → completed
active → abandoned
```

The UI labels the `abandoned` action as **Quit**. Quit sessions are retained internally but are not included in coach-facing performance history.

Every session athlete must be complete or skipped before completion. Already-saved attempts remain when a session is quit.

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

- signed-in coach must have access to the session's team
- session must still be active
- each requested athlete must be an active roster member of the session's team
- existing session athletes are left unchanged
- repeated requests are idempotent for athletes already present
- new athletes append to the queue as `pending`
- response is refreshed SessionDetail

---

# Phase 4 — Results

Performance analytics use **completed sessions only**. Quit/abandoned and active sessions remain stored operationally but do not affect PB/latest/previous, athlete history, leaderboards, team trends, or Train prior-result context.

## 25. Athlete results

### `GET /api/athletes/:athleteId/results`

`team_id` is required for the authorization boundary. Other filters are optional:

```text
?team_id=<id>&drill_id=<id>&from=<iso-date-or-timestamp>&to=<iso-date-or-timestamp>
```

The signed-in coach must have access to `team_id`, and the athlete must belong to that team.

Results are derived from saved valid Attempts and Measurements. The server does not persist PB/latest summary rows.

Response shape:

```json
{
  "athlete": {
    "id": "athlete_123",
    "first_name": "Emma",
    "last_name": "Johnson"
  },
  "groups": [
    {
      "drill": {
        "id": "drill_123",
        "name": "20-Yard Sprint",
        "category": "Speed"
      },
      "metric": {
        "type": "time",
        "key": "total_time",
        "label": "Time",
        "unit": "ms",
        "direction": "lower",
        "aggregation": "best",
        "total_attempts": null,
        "max": null
      },
      "summary": {
        "pb": 4010,
        "latest": 4180,
        "previous": 4260,
        "change_from_previous": -80,
        "improved_from_previous": true,
        "result_count": 4
      },
      "results": [
        {
          "session_id": "session_123",
          "team_id": "team_123",
          "drill_id": "drill_123",
          "drill_version_id": "drill_version_2",
          "athlete_id": "athlete_123",
          "started_at": "2026-08-18T01:30:00.000Z",
          "completed_at": "2026-08-18T02:00:00.000Z",
          "session_status": "completed",
          "value": 4180,
          "attempt_count": 2,
          "metric": {}
        }
      ]
    }
  ]
}
```

Derivation rules:

- each athlete/completed session produces at most one comparable result for a drill
- the session's stored DrillVersion defines the primary metric and attempt aggregation
- `best` uses the session definition's `direction` (`lower` = minimum, `higher` = maximum; `none` falls back to latest)
- `average`, `latest`, and `total` use the configured attempt aggregation literally
- timed drills use `total_time` / `elapsed_ms` as the comparable scalar
- `successes_attempts` uses `successes`
- `distance`, `count`, and `rating` use their canonical measurement key
- `custom_numeric` uses the first configured numeric field as the v1 comparable metric; all raw Measurements remain preserved on Attempts
- PB/latest summaries compare only historical results whose metric signature is compatible with the drill's current definition (type/key/unit/direction/aggregation and relevant denominator/range metadata)
- `direction: none` returns `pb: null` because there is no ranked personal best

## 26. Drill leaderboard

### `GET /api/drills/:drillId/leaderboard?team_id=:teamId`

`team_id` is required and must be accessible to the signed-in coach.

Response:

```json
{
  "drill": {
    "id": "drill_123",
    "name": "20-Yard Sprint",
    "category": "Speed"
  },
  "metric": {},
  "entries": [
    {
      "rank": 1,
      "athlete": {
        "id": "athlete_123",
        "first_name": "Emma",
        "last_name": "Johnson"
      },
      "membership": {
        "jersey_number": "12",
        "primary_position": "WR",
        "secondary_position": "DB"
      },
      "pb": 4010,
      "latest": 4180,
      "previous": 4260,
      "result_count": 4
    }
  ]
}
```

Ranking rules:

- leaderboard includes active team memberships only
- leaderboard ranks each athlete by their compatible all-time PB for the selected team/drill
- completed sessions only
- `lower` → ascending
- `higher` → descending
- tied PB values share a rank
- `none` → entries are returned unranked (`rank: null`)
- only valid persisted results count

## 26A. Team sessions, trends, and session context

These routes are also team-authorized server-side:

```text
GET /api/teams/:teamId/sessions
GET /api/teams/:teamId/drills/:drillId/trend
GET /api/sessions/:sessionId/result-context
```

Coach-facing session lists contain completed sessions only. Team trends and prior-result context use completed compatible results only.

## 27. Validation boundary

Client validation improves UX. Server validation is authoritative.

Never trust:

- athlete/team/session/membership IDs from browser without access checks
- `team_id` query parameters without checking `team_coaches`
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

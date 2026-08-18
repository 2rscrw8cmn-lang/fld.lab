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

Timed performance values are integer milliseconds.

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

Default behavior should return active teams. A future query flag may include archived teams if needed.

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

The roster endpoint returns a view model combining identity + membership for display convenience.

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

Optional future query:

```text
?include_inactive=true
```

Do not add pagination until roster sizes justify it.

## 14. Add athlete to roster

### `POST /api/teams/:teamId/roster`

The common MVP flow creates a new Athlete and TeamMembership in one transaction.

Request:

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
4. commit transaction
5. return combined row

If membership creation fails, do not leave a partial orphaned Athlete from this request.

### Add existing athlete to another team

Support when needed with:

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

Exactly one of `athlete` or `athlete_id` must be provided.

Existing active membership on the same team should return `409 conflict`.

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

When setting `active=false`, server may also set `left_at` if not already set.

Reactivation may set `active=true` and clear `left_at` for the same membership if that matches the workflow.

Do not delete athlete history.

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

Each row should include enough metadata for the library:

- id
- slug
- name
- category
- icon
- measurement type
- current version
- active

## 18. Drill detail

### `GET /api/drills/:drillId`

Returns stable Drill metadata plus current DrillVersion definition.

Historical sessions fetch their stored `drill_version_id`; never substitute current version when reading old results.

## 19. Import drill

### `POST /api/drills/import`

Request body is the drill definition JSON itself.

Server must validate against:

```text
schemas/drill-definition.schema.json
```

Then apply `DRILL_SPEC.md` semantic/versioning rules.

New drill response: `201`.

New version of existing slug: `201`.

Identical definition re-import may return `200` with the existing current version rather than creating duplicate versions.

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
5. return session + athlete queue + definition

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
  "athletes": []
}
```

## 21. Get/resume session

### `GET /api/sessions/:sessionId`

Returns:

- session
- exact drill definition version
- athlete queue/order
- SessionAthlete statuses
- persisted attempt counts/results needed to resume

## 22. Update session

### `PATCH /api/sessions/:sessionId`

Allowed status transitions:

```text
active → completed
active → abandoned
```

Do not mark completed if the server knows required pending persistence is unresolved in the current request flow.

Already-saved attempts remain when a session is abandoned.

## 23. Persist attempt

### `POST /api/sessions/:sessionId/attempts`

Request:

```json
{
  "client_attempt_id": "01J...",
  "athlete_id": "athlete_123",
  "attempt_number": 1,
  "elapsed_ms": 4180,
  "valid": true,
  "note": null,
  "measurements": [
    {
      "key": "total_time",
      "label": "Total Time",
      "value_numeric": 4180,
      "unit": "ms",
      "sequence": 0
    },
    {
      "key": "split_10yd",
      "label": "10 yd",
      "value_numeric": 2210,
      "unit": "ms",
      "sequence": 1
    }
  ]
}
```

Rules:

- `client_attempt_id` is required and unique for idempotent retry
- athlete must belong to the session queue
- attempt number must be valid for the drill
- measurements must match the session's immutable drill definition
- elapsed/split values are already captured by the browser; server does not retime them
- attempt + measurements persist transactionally

Response:

- first successful create → `201`
- retry with same `client_attempt_id` and same payload → `200` existing attempt
- same ID with conflicting payload → `409 conflict`

This prevents a network retry from duplicating an athlete result.

## 24. Session athlete status

### `PATCH /api/sessions/:sessionId/athletes/:athleteId`

Used for explicit session participation state such as skip/unskip.

Example:

```json
{
  "status": "skipped"
}
```

Do not represent skipped athletes with a zero-valued attempt.

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

Response should include raw session result history plus derived values needed by the UI, such as PB/latest, without making those derived values authoritative database records.

## 26. Drill leaderboard

### `GET /api/drills/:drillId/leaderboard?team_id=:teamId`

Rank according to drill `direction`:

- `lower` → ascending
- `higher` → descending
- `none` → no ranked leaderboard

Only valid attempts/results count.

## 27. Validation boundary

Client validation improves UX.

Server validation is authoritative.

Never trust:

- athlete/team IDs from browser without access checks
- drill definitions just because client validation passed
- elapsed values to match a different drill's expected schema
- archived/inactive relationships without explicit server rules

## 28. API evolution

When changing a request/response contract:

1. update this document
2. update shared TypeScript schemas/types if present
3. update tests
4. update affected UX/spec docs when behavior changes

Do not quietly create alternate shapes for the same resource in different screens.
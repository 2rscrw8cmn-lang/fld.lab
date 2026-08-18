# fld.LAB — Drill Definition Specification

## 1. Purpose

Drills are configuration, not one-off application features.

A coach can request a new drill, a JSON definition can be generated, and fld.LAB can import it without requiring a custom screen for that drill.

The reusable `DrillRunner` renders the field UI from the definition.

Machine validation for v1 lives at:

```text
schemas/drill-definition.schema.json
```

This document explains the semantic behavior. Keep both files aligned when the format changes.

## 2. Schema version

Initial format:

```json
{
  "schema_version": 1
}
```

Unknown schema versions must be rejected until explicitly supported.

## 3. Canonical timed type

The canonical timed measurement type is:

```json
"type": "time"
```

Do **not** use `timed`.

Internally, all timed values are integer milliseconds (`ms`).

## 4. Complete timed example

```json
{
  "schema_version": 1,
  "slug": "20-yard-sprint",
  "name": "20-Yard Sprint",
  "category": "Speed",
  "icon": "sprint",
  "description": "Measure acceleration and sprint speed over 20 yards.",
  "instructions": "Athlete starts behind the line and runs through the 20-yard mark.",
  "measurement": {
    "type": "time",
    "unit": "ms",
    "direction": "lower"
  },
  "attempts": {
    "count": 2,
    "result": "best"
  },
  "timer": {
    "enabled": true,
    "splits": [
      {
        "key": "split_10yd",
        "label": "10 yd"
      }
    ]
  },
  "equipment": ["2 cones"],
  "tags": ["speed", "acceleration"],
  "positions": ["ALL"],
  "setup": {
    "distance_yards": 20
  }
}
```

## 5. Top-level fields

| Field | Required | Purpose |
|---|---:|---|
| `schema_version` | yes | format version; v1 = `1` |
| `slug` | yes | stable machine identity |
| `name` | yes | coach-facing name |
| `category` | yes | grouping/filtering label |
| `icon` | no | approved icon-registry key |
| `description` | no | short summary |
| `instructions` | no | setup/execution guidance |
| `measurement` | yes | primary result definition |
| `attempts` | yes | attempt count + aggregation |
| `timer` | required for `time` | stopwatch/split behavior |
| `equipment` | no | equipment list |
| `tags` | no | filter/search metadata |
| `positions` | no | relevant positions; `ALL` allowed |
| `setup` | no | supported structured setup metadata |

For schema version 1, unknown top-level behavior fields are rejected rather than silently accepted.

## 6. Slug

`slug` is the stable imported-drill identity.

Examples:

```text
20-yard-sprint
5-10-5-shuttle
quick-catch-10
```

Changing display name/category does not create a new drill identity if the slug remains the same.

A truly separate drill requires a separate slug.

## 7. Icon

`icon` is decorative metadata only.

It must reference the approved registry in `DESIGN_SYSTEM.md`.

Rules:

- missing icon does not invalidate the drill
- unknown icon key does not invalidate otherwise valid drill behavior
- app falls back to a generic/category icon
- drill files never contain raw SVG or executable icon code

## 8. Measurement direction

Allowed:

```text
lower
higher
none
```

Direction controls PB/leaderboard comparison.

Examples:

- sprint time → `lower`
- catches → `higher`
- jump distance → `higher`
- unranked measurement → `none`

## 9. Measurement types

### `time`

```json
{
  "type": "time",
  "unit": "ms",
  "direction": "lower"
}
```

Requires `timer.enabled=true`.

### `successes_attempts`

```json
{
  "type": "successes_attempts",
  "unit": "count",
  "direction": "higher",
  "total_attempts": 10
}
```

Store successes and attempts as authoritative values. Percentage is derived.

### `distance`

```json
{
  "type": "distance",
  "unit": "in",
  "direction": "higher"
}
```

Prefer one normalized storage unit per drill.

### `count`

```json
{
  "type": "count",
  "unit": "reps",
  "direction": "higher"
}
```

### `rating`

```json
{
  "type": "rating",
  "unit": "score",
  "direction": "higher",
  "min": 1,
  "max": 5,
  "step": 1
}
```

### `custom_numeric`

```json
{
  "type": "custom_numeric",
  "direction": "higher",
  "fields": [
    {
      "key": "score",
      "label": "Score",
      "unit": "points"
    }
  ]
}
```

Use sparingly. When a repeated pattern becomes common, add a deliberate first-class measurement type in a new schema change.

## 10. Attempts

```json
{
  "attempts": {
    "count": 3,
    "result": "best"
  }
}
```

Supported aggregation values:

```text
best
average
latest
total
```

Every individual attempt remains stored even when the UI presents an aggregate result.

`UX_FLOWS.md` defines athlete queue behavior across multiple attempts.

## 11. Timer and splits

```json
{
  "timer": {
    "enabled": true,
    "splits": [
      {
        "key": "split_10yd",
        "label": "10 yd"
      },
      {
        "key": "split_20yd",
        "label": "20 yd"
      }
    ]
  }
}
```

Rules:

- `time` measurement requires the timer
- split buttons render in definition order
- each split captures elapsed milliseconds from original Start
- final Stop captures total elapsed time
- a drill may define zero splits
- splits persist as `Measurement` rows using their configured keys
- there is no separate `splits` database table in MVP

## 12. Examples

### Quick Catch

```json
{
  "schema_version": 1,
  "slug": "quick-catch-10",
  "name": "Quick Catch",
  "category": "Skills",
  "icon": "catch",
  "description": "Track successful catches across 10 receiving attempts.",
  "measurement": {
    "type": "successes_attempts",
    "unit": "count",
    "direction": "higher",
    "total_attempts": 10
  },
  "attempts": {
    "count": 1,
    "result": "latest"
  },
  "timer": {
    "enabled": false,
    "splits": []
  }
}
```

### 5-10-5 Shuttle

```json
{
  "schema_version": 1,
  "slug": "5-10-5-shuttle",
  "name": "5-10-5 Shuttle",
  "category": "Agility",
  "icon": "shuttle",
  "measurement": {
    "type": "time",
    "unit": "ms",
    "direction": "lower"
  },
  "attempts": {
    "count": 2,
    "result": "best"
  },
  "timer": {
    "enabled": true,
    "splits": []
  },
  "equipment": ["3 cones"]
}
```

## 13. Import behavior

Server-side import flow:

1. parse JSON
2. validate against `schemas/drill-definition.schema.json`
3. validate semantic rules
4. locate existing Drill by `slug`
5. create new Drill + DrillVersion when slug is new
6. create new DrillVersion when definition changed
7. make new version current
8. never rewrite a definition referenced by historical sessions

Client validation may provide earlier feedback but is not authoritative.

## 14. Duplicate/version handling

Example:

```text
20-yard-sprint v1
20-yard-sprint v2
```

Same slug + changed definition = new version of the same drill.

Same slug + identical current definition may return the existing version instead of generating a duplicate.

## 15. Renderer architecture

Do not create:

```text
TwentyYardSprintScreen
CatchingScreen
BroadJumpScreen
```

Prefer reusable primitives:

```text
DrillRunner
TimerInput
SplitControls
SuccessAttemptInput
DistanceInput
CountInput
RatingInput
CustomNumericInput
AttemptNavigator
AthleteSwitcher
```

The definition selects which behavior is rendered.

## 16. Schema changes

Do not add ad hoc fields to production drill JSON.

If a requested drill cannot be represented cleanly:

1. decide whether the new behavior is broadly reusable
2. update this specification
3. update `schemas/drill-definition.schema.json`
4. add validator tests
5. decide whether `schema_version` must increase

The drill format is declarative configuration, not a scripting language.
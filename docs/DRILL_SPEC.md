# fld.LAB — Drill Definition Specification

## 1. Purpose

Drills should be configuration, not one-off application features.

A coach can request a new drill, a JSON definition can be generated, and fld.LAB can import it without requiring a new custom screen for every drill.

The reusable `DrillRunner` should render the field UI from this definition.

## 2. Version

Initial format version:

```json
{
  "schema_version": 1
}
```

Every imported file must include `schema_version` so the application can validate and migrate future formats safely.

## 3. Core definition

```json
{
  "schema_version": 1,
  "slug": "20-yard-sprint",
  "name": "20-Yard Sprint",
  "category": "Speed",
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
  }
}
```

## 4. Required top-level fields

| Field | Type | Required | Notes |
|---|---|---:|---|
| `schema_version` | integer | yes | Initial value `1` |
| `slug` | string | yes | Stable machine identifier |
| `name` | string | yes | Coach-facing name |
| `category` | string | yes | Speed, Agility, Skills, Defense, etc. |
| `description` | string | no | Short summary |
| `instructions` | string | no | Setup/execution guidance |
| `measurement` | object | yes | Primary result definition |
| `attempts` | object | yes | Number of attempts and aggregation |
| `timer` | object | conditional | Required when timer behavior is needed |

## 5. Measurement types

Initial supported values for `measurement.type`:

### `time`
Timed result.

```json
{
  "type": "time",
  "unit": "ms",
  "direction": "lower"
}
```

Internally store time in milliseconds. Display formatting may show seconds and hundredths.

### `successes_attempts`
Used for catching, flag pulling, accuracy, snaps, etc.

```json
{
  "type": "successes_attempts",
  "unit": "count",
  "direction": "higher",
  "total_attempts": 10
}
```

The app can display both `8 / 10` and `80%` without storing the percentage as the authoritative value.

### `distance`

```json
{
  "type": "distance",
  "unit": "in",
  "direction": "higher"
}
```

Prefer a single normalized storage unit; format for display as needed.

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
For future drills that need named numeric fields.

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

Use this sparingly. Prefer first-class measurement types when a pattern becomes common.

## 6. Direction

`measurement.direction` controls comparisons, PB calculations, and leaderboard order.

Allowed values:
- `lower`
- `higher`
- `none`

Examples:
- sprint time → `lower`
- catches → `higher`
- broad jump → `higher`
- subjective notes-only drill → `none`

## 7. Attempts

```json
{
  "attempts": {
    "count": 3,
    "result": "best"
  }
}
```

Initial supported `result` values:
- `best`
- `average`
- `latest`
- `total`

The runner should still retain every individual attempt even when one aggregated value is presented as the drill result.

## 8. Timer configuration

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
- `timer.enabled` determines whether the stopwatch UI appears.
- Split buttons appear in definition order.
- A split records elapsed time from the original start, not time since the prior split.
- The final Stop action records total elapsed time.
- A drill may have no splits.

## 9. Optional metadata

Future-safe optional metadata may include:

```json
{
  "equipment": ["4 cones", "measuring tape"],
  "tags": ["speed", "acceleration"],
  "positions": ["ALL"],
  "setup": {
    "distance_yards": 20
  }
}
```

These fields should not be required to run a drill unless explicitly defined by a later schema version.

## 10. Import behavior

When a JSON file is imported:

1. Parse JSON.
2. Validate `schema_version`.
3. Validate required fields and supported enum values.
4. Reject unknown/invalid required behavior with a clear error.
5. Find an existing Drill by `slug`.
6. If none exists, create a new Drill + DrillVersion.
7. If it exists and the definition differs, create a new DrillVersion.
8. Set the new version as current.
9. Never rewrite the definition attached to historical sessions.

## 11. Duplicate handling

The `slug` is the stable identity.

Example:

- existing: `20-yard-sprint`, version 1
- imported updated definition: `20-yard-sprint`, version 2

This is an update, not a second drill.

If the coach wants a truly separate drill, it needs a distinct slug.

## 12. Example: catching drill

```json
{
  "schema_version": 1,
  "slug": "quick-catch-10",
  "name": "Quick Catch",
  "category": "Skills",
  "description": "Track successful catches across 10 rapid receiving attempts.",
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

## 13. Example: 5-10-5 shuttle

```json
{
  "schema_version": 1,
  "slug": "5-10-5-shuttle",
  "name": "5-10-5 Shuttle",
  "category": "Agility",
  "description": "Change-of-direction test using two five-yard direction changes.",
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

## 14. UX implication

The application should not contain individual pages such as:

```text
TwentyYardSprintScreen
CatchingScreen
BroadJumpScreen
```

Instead it should contain reusable primitives such as:

```text
DrillRunner
TimerInput
SplitControls
SuccessAttemptInput
DistanceInput
CountInput
RatingInput
AttemptNavigator
AthleteSwitcher
```

The drill definition chooses which primitives are rendered.

## 15. Guardrail

Do not make the JSON format capable of arbitrary code execution or arbitrary UI composition. It is a declarative drill definition, not a scripting language.

If a future requested drill cannot be represented cleanly, extend the schema deliberately rather than adding ad hoc fields.

# fld.LAB — Technical Architecture

## 1. Architecture goal

Keep the application small, understandable, and easy to extend with AI-assisted coding.

The product does not need a large distributed architecture. Prefer one web application, one API layer, and one relational database.

## 2. Proposed stack

### Front end
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Lucide icons
- Recharts

### Cloudflare
- Cloudflare Workers
- Cloudflare Static Assets
- Cloudflare D1
- Wrangler / Cloudflare Vite plugin

Cloudflare's current Vite integration supports React SPAs, static assets, and a Worker API in the same application. D1 provides the SQL persistence layer through Worker bindings.

## 3. Application shape

Prefer a single repository and deployment unit.

```text
Browser / iPad / Phone
        │
        ├── React UI
        │     ├── Home
        │     ├── Roster
        │     ├── Train
        │     ├── Data
        │     └── Drills
        │
        └── /api/*
              │
        Cloudflare Worker
              │
              └── D1
```

Do not introduce a separate backend service unless a concrete requirement demands it.

## 4. Suggested repository structure

```text
/
├── docs/
├── public/
├── src/
│   ├── app/
│   ├── components/
│   │   ├── ui/
│   │   ├── athlete/
│   │   ├── drill/
│   │   └── charts/
│   ├── features/
│   │   ├── roster/
│   │   ├── training/
│   │   ├── data/
│   │   └── drills/
│   ├── lib/
│   ├── routes/
│   └── styles/
├── worker/
│   ├── index.ts
│   ├── routes/
│   ├── db/
│   └── services/
├── migrations/
├── vite.config.ts
├── wrangler.jsonc
└── package.json
```

Exact structure may change during scaffolding, but keep domain logic grouped and avoid a large generic `utils` dumping ground.

## 5. Timing architecture

### Critical rule

**The network must never be in the timing path.**

Start, split, and stop happen entirely in the browser. The API receives the finished attempt after timing has completed.

### Timer implementation

Do not calculate elapsed time by counting `setInterval` ticks.

Use a monotonic browser clock such as `performance.now()`:

```text
startTimestamp = performance.now()
currentElapsed = performance.now() - startTimestamp
```

The animation/update loop is only responsible for rendering the current value. If the UI skips frames, the underlying elapsed calculation remains correct.

Split values should store elapsed milliseconds from the original start timestamp.

Final authoritative timed result:
- integer milliseconds
- client-generated after Stop
- persisted to D1 after the run

### Timer UI state

Suggested state machine:

```text
READY
  ↓ start
RUNNING
  ├── split → RUNNING
  ↓ stop
STOPPED
  ├── save → SAVED / NEXT ATHLETE
  ├── redo → READY
  └── edit → STOPPED
```

Avoid timer behavior spread across multiple components. Keep stopwatch state in one focused training module.

## 6. Athlete switching

The active session should load its athlete queue into client state.

Switching athletes must not require a network request.

The client should already know:
- athlete ID
- display name
- jersey number
- queue order
- completion status
- previous/best result when available

Network writes can update completion/result state after capture without blocking the next athlete transition.

## 7. Save behavior

For field usability:

1. Coach stops or enters the result.
2. Result exists immediately in local application state.
3. `Save + Next` advances immediately.
4. Persist result through the API.
5. Show a subtle retry/error state if persistence fails.

Do not make the coach wait on a loading spinner between athletes under normal conditions.

### MVP network guardrail

The stopwatch must function without connectivity, but a full offline-first synchronization system is not required for the initial build.

A reasonable MVP is:
- keep unsaved/failed results in local state
- visibly mark save failures
- allow retry
- do not silently discard a result

Full offline session persistence can be added later if actual field use requires it.

## 8. API principles

Use a small resource-oriented Worker API.

Possible routes:

```text
GET    /api/teams
POST   /api/teams

GET    /api/teams/:teamId/athletes
POST   /api/teams/:teamId/athletes
PATCH  /api/athletes/:athleteId

GET    /api/drills
POST   /api/drills/import
GET    /api/drills/:drillId

POST   /api/sessions
GET    /api/sessions/:sessionId
PATCH  /api/sessions/:sessionId

POST   /api/sessions/:sessionId/attempts
PATCH  /api/attempts/:attemptId

GET    /api/athletes/:athleteId/results
GET    /api/drills/:drillId/leaderboard
```

This is a starting contract, not a requirement to create every route before it is needed.

## 9. D1 rules

- schema changes go through migrations
- use foreign keys where supported/appropriate
- use stable generated IDs; never use names as keys
- store timestamps consistently
- store timed values as integer milliseconds
- archive historical entities instead of casually deleting them
- keep DrillVersion records immutable once used

Avoid introducing an ORM until it clearly reduces complexity. Direct typed SQL or a lightweight query layer may be sufficient for this scale.

## 10. Drill import architecture

Import flow:

```text
JSON file
   ↓
parse
   ↓
validate schema
   ↓
normalize
   ↓
compare slug/current version
   ↓
create Drill or DrillVersion
   ↓
make version current
```

Validation must happen server-side even if the browser validates first.

The imported definition is declarative data. Never evaluate executable code from a drill file.

## 11. UI component strategy

Prefer existing primitives over custom components whenever possible.

Use standard components for:
- buttons
- dialogs/sheets
- inputs
- menus
- select controls
- tables
- tabs
- badges
- tooltips

Custom effort should concentrate on:
- `AthleteSwitcher`
- `DrillRunner`
- `Stopwatch`
- `SplitControls`
- measurement input renderers
- compact result rows
- performance charts

## 12. Responsive strategy

### iPad landscape
Primary target.
- persistent side navigation
- compact tables
- two-column content where useful
- large Train interaction area

### Phone
- collapse navigation
- reduce nonessential metadata
- preserve compact 44–52 px roster rows
- keep Train controls large
- avoid horizontal table dependence

Do not build separate tablet and phone applications. Use responsive layouts around the same domain components.

## 13. State management

Start with React's built-in state patterns and a query/cache layer only if needed.

Do not add a global state library merely because one exists.

Potential shared client state:
- current team
- current session
- active athlete
- unsaved attempt state

Server data should remain server data rather than being duplicated into a complex global store.

## 14. Charts

Use charts only when they communicate change over time or comparison clearly.

Initial chart needs:
- athlete result trend
- optional team average trend

Leaderboards should normally be tables/lists rather than charts.

## 15. Authentication

Authentication is intentionally TBD until the ownership/access model is confirmed.

Do not block the core data model on a sophisticated role system.

Likely eventual model:
- authenticated coach
- coach has access to one or more teams
- athletes do not need accounts initially

## 16. Testing priorities

Highest-value automated tests:

1. timer elapsed/split calculation
2. drill JSON validation
3. drill versioning/import behavior
4. PB/leaderboard direction (`higher` vs `lower`)
5. session Save + Next behavior
6. result persistence/retry handling
7. responsive roster behavior at phone/tablet widths

Do not pursue arbitrary coverage percentages at the expense of these critical workflows.

## 17. Implementation guardrails

- No framework rewrite without a concrete need.
- No microservices.
- No custom design system before the product proves it needs one.
- No one-off page per drill.
- No server-timed stopwatch.
- No optimistic flow that can silently lose athlete results.
- No unnecessary youth-athlete PII.
- No analytical complexity on Home.
- No feature should slow down switching from one athlete to the next.

## 18. First build sequence

Recommended order:

1. scaffold React + TypeScript + Cloudflare Worker
2. establish D1 + migrations
3. build shell/navigation/responsive layout
4. build roster table + Add Athlete
5. define and import drill schema
6. build DrillRunner + stopwatch
7. build training session / athlete queue
8. persist attempts/results
9. build athlete history + PBs
10. build basic Data page charts/leaderboards
11. field-test on a real iPad/phone before adding more features

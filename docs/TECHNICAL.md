# fld.LAB — Technical Architecture

## 1. Architecture goal

Keep fld.LAB small, understandable, field-reliable, and easy to extend with AI-assisted coding.

Prefer one web app, one Worker API, and one relational database.

## 2. Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Lucide
- Recharts

### Cloudflare

- Workers
- Static Assets
- D1
- Wrangler
- Cloudflare Vite plugin

## 3. Application shape

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

Do not introduce a separate backend service without a concrete requirement.

## 4. Suggested repository structure

```text
/
├── AGENTS.md
├── docs/
├── schemas/
├── migrations/
├── public/
├── scripts/
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
├── vite.config.ts
├── wrangler.jsonc
└── package.json
```

Exact generated structure may vary. Keep domain logic grouped and avoid a generic `utils` dumping ground.

## 5. Contract ownership

Do not redefine product/data contracts in implementation code.

Use:

- `PRODUCT.md` — product behavior
- `UX_FLOWS.md` — interaction/state behavior
- `DATA_MODEL.md` — entity ownership
- `API_CONTRACT.md` — Worker routes/request/response shapes
- `DRILL_SPEC.md` + JSON Schema — drill format
- `DESIGN_SYSTEM.md` — UI rules

This document describes architecture, not alternate contracts.

## 6. Timing architecture

### Critical rule

**The network is never in the timing path.**

Start, split, and stop happen entirely in browser state. The Worker receives the completed attempt afterward.

### Clock

Do not calculate elapsed time by counting `setInterval` ticks.

Use a monotonic browser clock:

```ts
const startTimestamp = performance.now()
const elapsedMs = performance.now() - startTimestamp
```

Animation/render loops only update what the coach sees. Skipped frames must not change elapsed calculation.

Split values are elapsed milliseconds from the same original Start timestamp.

### Timer states

```text
READY
  ↓ start
RUNNING
  ├── split → RUNNING
  ↓ stop
STOPPED_REVIEW
  ├── save → local commit + next/stay
  ├── redo → READY
  └── edit → STOPPED_REVIEW
```

`UX_FLOWS.md` defines user-visible behavior.

Keep stopwatch state in one focused training module rather than distributing it across unrelated components.

## 7. Athlete queue

An active session loads its athlete queue into client state.

Switching athletes must not require a network request.

Client queue should know at least:

- athlete ID
- membership/display context
- display name
- jersey number
- queue order
- skipped/completion state
- saved attempt count
- previous/PB context when available

While a timer is running, direct athlete switching is disabled to prevent misassignment.

## 8. Save behavior

Field flow:

1. coach captures/stops result
2. result exists in local attempt state
3. coach reviews it
4. `Save + Next` commits it to local session state
5. UI advances immediately
6. Worker persistence happens asynchronously
7. save status becomes pending/saved/failed

A failed write must remain associated with the original session/athlete/attempt and remain retryable.

Do not show a blocking spinner between athletes under normal conditions.

### Idempotency

Attempt persistence uses a stable `client_attempt_id` as defined in `API_CONTRACT.md` so retries do not duplicate results.

## 9. Connectivity guardrail

Full offline-first synchronization across browser restarts is not required for the initial MVP.

Minimum behavior:

- timing works without connectivity
- captured result remains in local client state
- failed writes are visible
- retry is available
- browser-leave warning is used when practical for running/unsaved work
- no silent result loss

If field testing proves browser-restart persistence is necessary, add it deliberately later.

## 10. API

The canonical Worker contract is `API_CONTRACT.md`.

Phase 1 core routes include:

```text
GET    /api/health
GET    /api/teams
POST   /api/teams
PATCH  /api/teams/:teamId
GET    /api/teams/:teamId/roster
POST   /api/teams/:teamId/roster
PATCH  /api/athletes/:athleteId
PATCH  /api/team-memberships/:membershipId
```

Later phases add drill/session/result endpoints exactly as documented there.

Do not create alternate routes merely because a component wants a different shape. Use server view models where needed while preserving resource ownership.

## 11. D1 rules

- all schema changes use migrations
- use stable generated IDs
- use foreign keys/constraints where appropriate
- store timestamps consistently
- store elapsed time as integer milliseconds
- archive entities with history
- used DrillVersion records are immutable
- Team is season-specific for MVP
- Athlete owns identity
- TeamMembership owns jersey number/positions
- timed splits are Measurement rows
- there is no separate splits table

Avoid an ORM until it clearly reduces complexity. Direct typed SQL or a lightweight query layer is sufficient initially.

See `DATA_MODEL.md` and `CLOUDFLARE.md`.

## 12. Drill import architecture

```text
JSON file
   ↓
client parse/validation for UX
   ↓
Worker parse
   ↓
JSON Schema validation
   ↓
semantic validation
   ↓
find Drill by slug
   ↓
create/reuse DrillVersion
   ↓
set current version
```

Rules:

- server validation is authoritative
- imported files are declarative data only
- never evaluate executable code from a drill file
- same slug identifies the same drill concept
- used versions are immutable

## 13. UI component strategy

Prefer existing primitives for:

- buttons
- dialogs/sheets
- inputs
- menus
- selects
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
- progress charts

Follow `DESIGN_SYSTEM.md`.

## 14. Responsive strategy

### iPad landscape

Primary target:

- persistent side navigation
- compact tables
- two-column content where it improves scanning
- large Train interaction area

### Phone

- collapse navigation
- reduce secondary metadata
- keep roster rows dense
- keep Train controls large
- avoid horizontal-table dependence

Use one responsive application, not separate tablet/phone apps.

## 15. Client state

Start with React built-in state patterns.

Do not add a global state library just because one exists.

Shared client concepts may include:

- current team
- current session
- athlete queue
- active athlete
- current attempt
- pending/failed attempt writes

Server data should remain server data rather than being copied into a complex global store.

Add a query/cache library only if it materially simplifies real server-state requirements.

## 16. Charts

Charts exist to communicate progress, not decorate screens.

Initial needs:

- athlete result trend
- optional team average trend

Leaderboards are normally tables/lists.

## 17. Security boundary

Authentication mechanism is deferred, but production access requirements are not.

Local development may use fictional data without auth.

Before real athlete data is available on an internet deployment, enforce `SECURITY.md`:

- authenticated access
- server-side team authorization
- protected reads/writes

Do not spread provider-specific authentication assumptions through domain code before the auth mechanism is selected.

## 18. Testing priorities

Highest-value automated tests:

1. timer elapsed/split calculation
2. drill JSON Schema + semantic validation
3. drill versioning/import behavior
4. higher/lower result direction
5. athlete queue + Save + Next behavior
6. `client_attempt_id` idempotent persistence
7. failed save/retry behavior
8. roster identity vs membership ownership
9. responsive roster behavior

Do not chase arbitrary coverage percentages at the expense of these workflows.

## 19. Implementation guardrails

- no framework rewrite without concrete need
- no microservices
- no custom design system separate from documented tokens/components
- no page component per drill
- no server-timed stopwatch
- no silent optimistic result loss
- no unnecessary youth-athlete PII
- no analytics-heavy Home
- no separate splits table
- no jersey/position fields on Athlete for MVP
- no feature that slows switching athletes

## 20. First build sequence

1. scaffold React + TypeScript + Cloudflare Worker
2. establish D1 + migrations
3. build shell/navigation
4. build team/roster data layer
5. build roster UI
6. build drill schema/import
7. build DrillRunner + stopwatch
8. build session/athlete queue
9. persist attempts/results
10. build history/PBs
11. build Data charts/leaderboards
12. field-test on real iPad/phone before adding more features

Follow `BUILD_PLAN.md` and current GitHub issues for phase scope.
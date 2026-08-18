# fld.LAB

**fld.LAB** is a tablet-first web app for coaches to run athlete testing/training sessions, capture results quickly on the field, and track performance over time.

## Product goal

Make field testing fast enough that one coach can operate the app from an iPad or phone without slowing down practice.

The product is intentionally narrow:

- manage season-specific team rosters
- run configurable drills/tests
- switch between athletes quickly
- capture timed splits, attempts, scores, distances, counts, ratings, and notes
- review athlete/team progress over time
- add new drill types through importable JSON definitions instead of custom screens

## Core areas

### Home
Launch or resume training. Home is for action, not analysis.

### Roster
Compact roster table with add/edit/archive controls and athlete history access.

### Train
Primary field workflow: choose drill, select athlete, capture result, save, and move immediately to the next athlete.

### Data
Athlete history, personal bests, trends, drill leaderboards, and team comparisons.

### Supporting

- **Drills** — library + JSON import/version management
- **Settings** — team/application preferences as real needs appear

## Product rules

1. **Field speed first.** Common actions should take as few taps as possible.
2. **Roster and Data are dense; Train is big.**
3. **No oversized athlete cards.** Prefer compact rows/tables.
4. **Drills are data.** One reusable runner renders documented measurement types.
5. **Historical data is durable.** Editing roster data or drill definitions does not rewrite prior results.
6. **Tablet first, phone capable.** Optimize for iPad landscape while keeping phone workflows usable.
7. **Keep scope narrow.** fld.LAB is not a full youth-sports administration platform.

## Working visual direction

- Brand: `fld.LAB`
- Primary: `#7C3AED` purple
- Foundation: `#0F172A` midnight
- Dark UI
- Sports-performance feel
- Lucide line icons
- shadcn/ui primitives
- Recharts for progress charts

## Proposed stack

- React + TypeScript
- Vite
- Cloudflare Workers + Static Assets
- Cloudflare D1
- Tailwind CSS
- shadcn/ui
- Lucide
- Recharts

## Documentation

### Read first

- [`AGENTS.md`](AGENTS.md) — coding-agent rules and document precedence
- [`docs/PRODUCT.md`](docs/PRODUCT.md) — product scope and UX requirements
- [`docs/UX_FLOWS.md`](docs/UX_FLOWS.md) — exact screen/session interaction behavior

### Data + API

- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — entities, ownership, relationships, historical rules
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — Worker HTTP request/response contract
- [`docs/DRILL_SPEC.md`](docs/DRILL_SPEC.md) — human-readable drill/import behavior
- [`schemas/drill-definition.schema.json`](schemas/drill-definition.schema.json) — machine-readable drill validation schema

### Design + implementation

- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — colors, icons, components, density, assets
- [`docs/TECHNICAL.md`](docs/TECHNICAL.md) — application architecture and timing guardrails
- [`docs/CLOUDFLARE.md`](docs/CLOUDFLARE.md) — Cloudflare/D1 setup, migrations, deploy, recovery
- [`docs/SECURITY.md`](docs/SECURITY.md) — privacy and production access requirements
- [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) — phased implementation sequence

## Fixed MVP model decisions

- a Team is season-specific
- Athlete owns identity
- TeamMembership owns jersey number and positions
- canonical timed drill measurement type is `time`
- time is stored as integer milliseconds
- splits are Measurement records, not a separate table
- one TrainingSession = one team + one drill
- stopwatch timing is entirely client-side
- real youth-athlete data must not be exposed on an unauthenticated public deployment

## Current status

Planning/foundation complete enough to begin Phase 1 implementation.

Start with GitHub Issue #1 and follow `docs/BUILD_PLAN.md`.
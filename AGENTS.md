# fld.LAB — Coding Agent Instructions

This repository is specification-driven. Read the relevant docs before changing application behavior.

## 1. Product objective

fld.LAB is a tablet-first web app for a coach to:

1. manage a roster
2. choose a drill
3. capture athlete results quickly on the field
4. move between athletes without slowing practice
5. review athlete/team progress over time

Do not turn fld.LAB into a general youth-sports administration platform.

## 2. Source-of-truth order

When documents overlap, use this precedence:

1. `AGENTS.md` — repository-level implementation rules
2. `docs/PRODUCT.md` — product scope and behavior
3. `docs/UX_FLOWS.md` — screen states and interaction behavior
4. `docs/DATA_MODEL.md` — entity ownership and database relationships
5. `docs/API_CONTRACT.md` — HTTP request/response behavior
6. `docs/DRILL_SPEC.md` — human-readable drill format
7. `schemas/drill-definition.schema.json` — machine-readable drill validation
8. `docs/DESIGN_SYSTEM.md` — visual/component rules
9. `docs/TECHNICAL.md` — architecture and implementation guardrails
10. `docs/CLOUDFLARE.md` — Cloudflare/D1 operating procedure
11. `docs/BUILD_PLAN.md` — sequence and phase scope

If two authoritative docs conflict, do not silently choose a third interpretation. Fix the documentation in the same PR or call out the conflict clearly.

## 3. Fixed MVP decisions

Do not reinterpret these during implementation:

- React + TypeScript + Vite
- Cloudflare Worker API + Static Assets
- Cloudflare D1
- Tailwind CSS + shadcn/ui
- Lucide icons only by default
- Recharts for progress charts
- tablet landscape is the primary layout target
- phone remains fully usable
- Home = launch
- Roster = people
- Train = capture
- Data = analyze
- Drills = configure
- roster/data interfaces are dense
- active training controls are large
- drill behavior is data-driven, not one custom screen per drill
- canonical timed measurement type is `time`
- timed values are integer milliseconds
- splits are `Measurement` records, not a separate table
- one `TrainingSession` = one team + one drill
- `Team` is season-specific for MVP
- `Athlete` owns identity
- `TeamMembership` owns jersey number and positions
- the network is never in the stopwatch timing path

## 4. Scope control

Do not add these unless a later issue/spec explicitly requests them:

- parent/player portal
- messaging
- payments
- league/game scheduling
- attendance
- medical records
- video analysis
- social feed
- complex practice planning
- organizations/clubs above teams
- separate Season entity
- athlete photos
- global state library
- ORM
- microservices

Prefer the smallest implementation that cleanly satisfies the current issue.

## 5. UI rules

Before creating a custom component, check whether shadcn/ui or an existing fld.LAB component can do the job.

Do not:

- introduce another icon pack
- use emoji as interface icons
- invent feature-specific colors
- make tall athlete cards
- turn every section into a rounded card
- create a unique button system per page
- add decorative motion that slows field workflow

Roster rows should generally remain about 44–52 px high.

Follow `docs/DESIGN_SYSTEM.md`.

## 6. Training/timer rules

Critical:

- Start, Split, and Stop run in browser state.
- Use a monotonic clock such as `performance.now()`.
- Do not calculate elapsed time by counting interval ticks.
- Do not wait for an API response to switch athletes after a completed result.
- Never silently discard an unsaved/failed result.
- Athlete switching must not make a network request.

Follow `docs/UX_FLOWS.md` and `docs/TECHNICAL.md`.

## 7. Database rules

- every schema change is a migration
- use stable generated IDs
- never use names/jersey numbers as keys
- preserve historical drill versions
- archive entities with history rather than hard-deleting them by default
- do not create a `splits` table
- do not store jersey number/position on `Athlete` for MVP
- do not manually patch production schema as normal workflow

Follow `docs/DATA_MODEL.md` and `docs/CLOUDFLARE.md`.

## 8. Drill rules

- imported drill files are declarative JSON only
- no executable code in drill files
- validate imports server-side
- `slug` is the stable drill identity
- used drill versions are immutable
- unknown decorative icon keys should fall back rather than invalidate a drill
- do not invent drill measurement types outside the schema

When changing drill structure, update both:

```text
docs/DRILL_SPEC.md
schemas/drill-definition.schema.json
```

## 9. API rules

- browser talks to `/api/*`; browser never administers D1 directly
- return structured errors defined by `docs/API_CONTRACT.md`
- validate server-side even when the client also validates
- destructive/archive behavior must be explicit
- do not expose production athlete data from unauthenticated endpoints

## 10. Privacy and production access

This is a public repository and the product will contain youth-athlete information.

Never commit:

- real athlete exports
- real database dumps
- production tokens/secrets
- unsanitized production screenshots
- real production seed data

Local/mock development can be unauthenticated.

Do **not** put real youth-athlete names/results into an internet-accessible production deployment until the access-control requirements in `docs/SECURITY.md` are implemented.

## 11. Change discipline

For each issue:

1. read the referenced docs
2. keep the PR limited to that issue/phase
3. update docs if implementation legitimately changes a documented decision
4. add focused tests for critical behavior
5. verify tablet and phone behavior for UI work
6. run typecheck/tests/build before completion

Avoid large PRs spanning multiple phases.

## 12. Highest-value tests

Prioritize:

1. timer elapsed/split math
2. drill JSON validation
3. drill versioning/import behavior
4. higher-vs-lower result ranking
5. Save + Next / athlete queue behavior
6. failed-result persistence/retry behavior
7. roster CRUD and membership ownership
8. responsive roster behavior

Do not optimize for an arbitrary coverage percentage.
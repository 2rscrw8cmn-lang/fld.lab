# fld.LAB Build Plan

Build in order. Do not pull later-phase features forward unless a dependency requires it.

## Product rule

- Home = launch
- Roster = people
- Train = capture
- Data = analyze
- Drills = configure

The app is tablet-first, phone-capable, coach-operated, and optimized for fast field use.

Before implementation, read `AGENTS.md` and the issue's referenced docs.

---

## Phase 1 — Foundation + roster

### Goal

Create the production-ready app shell and first complete roster workflow.

### Deliverables

- React + TypeScript + Vite
- Cloudflare Worker + Static Assets
- Tailwind + shadcn/ui + Lucide
- responsive shell/navigation
- routes: Home, Roster, Train, Data, Drills, Settings
- Cloudflare D1 + migrations
- `teams`
- `athletes`
- `team_memberships`
- compact roster table
- Add Athlete sheet/dialog
- edit athlete identity + membership
- archive/reactivate membership
- global team selection

### Fixed data decision

- Team is season-specific.
- Athlete owns identity.
- TeamMembership owns jersey number + positions.

### Definition of done

- app builds/deploys successfully
- local D1 can be rebuilt from migrations
- coach can create/select a team and add/edit/archive roster members
- roster remains dense and easy to scan on iPad and phone
- no timing/drill execution yet

---

## Phase 2 — Drill library + imports

### Goal

Make drills configurable data rather than hard-coded screens.

### Deliverables

- drill library
- server/client validation against `schemas/drill-definition.schema.json`
- import workflow
- versioned drill definitions
- supported v1 measurement types:
  - `time` (with optional configured splits)
  - `successes_attempts`
  - `distance`
  - `count`
  - `rating`
  - `custom_numeric`
- starter fictional flag-football drill definitions
- drill detail/preview

### Definition of done

- valid JSON imports without code changes
- invalid JSON/behavior shows clear errors
- changed definition creates a new immutable DrillVersion
- historical sessions retain the version used when they started

---

## Phase 3 — Train + timing

### Goal

Build the core field workflow.

### Deliverables

- Start/Resume Session
- DrillRunner driven by drill definitions
- client-loaded athlete queue
- fast athlete selector
- client-side stopwatch
- split capture as Measurement values
- manual/non-timed result inputs
- multiple-attempt handling
- Save + Next / Save + Stay
- Redo/Edit before save
- Skip/unskip
- previous result + PB context
- persistence retry indicator

### Timing rules

- Start/Split/Stop run entirely in browser state.
- Use monotonic time such as `performance.now()`.
- Network never determines elapsed time.
- Save + Next does not wait for the API before advancing.
- Failed persistence stays visible/retryable.

### Definition of done

- one coach can run a drill from an iPad without navigating away
- switching athletes is immediate when timer is not running
- results cannot be assigned to the wrong athlete during asynchronous saves
- network latency does not affect recorded times

---

## Phase 4 — History + data

### Goal

Turn captured results into useful progress information.

### Deliverables

- athlete profile
- PB/latest result
- result history
- simple progress chart
- drill leaderboard
- team averages/trends
- filters by athlete/drill/team/date
- recent sessions
- session detail

### Definition of done

Coach can answer:

- Is this athlete improving?
- What is their best/latest result?
- Who is best/fastest at this drill?

without exporting data.

---

## Phase 5 — Home + field polish

### Goal

Create the simple launch surface and harden repeated field use.

### Deliverables

- Home launch page
- Quick Start / recent drills
- Resume active session
- roster snapshot
- recent sessions
- PWA install support
- loading/empty/error states polish
- touch-target/accessibility pass
- weak-connectivity behavior pass
- export/backup user path if needed

### Home rule

Do not turn Home into an analytics dashboard. Detailed progress and ranking belong in Data.

### Definition of done

- Home gets coach into training quickly
- app installs cleanly to iPad/iPhone home screen
- core workflows remain understandable under weak connectivity

---

## Production access gate

Before real youth-athlete data is used on an internet-accessible deployment, implement and verify `docs/SECURITY.md` production-access requirements.

This gate may be completed during the appropriate phase but is mandatory before real production data.

---

## Phase 6 — Post-MVP only

Consider only after field use proves the need:

- more sophisticated authentication/roles
- organizations/clubs
- separate Season entity
- athlete photos
- CSV bulk roster import
- parent/player portals
- messaging
- attendance
- practice planning/calendar
- video attachments
- wearables/sensors
- advanced benchmarking
- automated reports

These are not required for the first usable release.

---

## Implementation order inside a phase

1. data model/migration when applicable
2. API contract
3. core logic
4. reusable UI
5. screen workflow
6. responsive behavior
7. empty/error/failure states
8. focused tests
9. deploy + real-device check

## Quality bar

Every phase should end in a deployable build.

Prefer small PRs tied to one issue. Do not combine multiple phases into a single large branch.
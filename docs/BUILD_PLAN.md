# fld.LAB Build Plan

This plan keeps the first release small, field-usable, and easy to extend. Build in order. Do not add features from later phases until the current phase is stable.

## Product rule

- Home = launch
- Roster = people
- Train = capture
- Data = analyze
- Drills = configure

The app is tablet-first, phone-capable, coach-operated, and optimized for fast use during practice.

---

## Phase 1 — Foundation + roster

### Goal
Create the production-ready app shell and roster workflow.

### Deliverables
- React + TypeScript + Vite app
- Cloudflare Workers integration
- Tailwind CSS + shadcn/ui + Lucide
- Responsive app shell
- Routes: Home, Roster, Train, Data, Drills, Settings
- D1 database and migration structure
- Teams and athletes schema
- Compact roster table
- Add Athlete modal/drawer
- Edit athlete
- Archive/reactivate athlete
- Team selection

### Definition of done
- App builds and deploys successfully.
- A coach can create a team and add/edit/archive athletes.
- Roster remains dense and easy to scan on iPad and phone.
- No timing or drill execution yet.

---

## Phase 2 — Drill library + imports

### Goal
Make drills configurable data rather than hard-coded screens.

### Deliverables
- Drill library page
- Drill JSON schema and validation
- Import Drill workflow
- Versioned drill definitions
- Supported measurement types:
  - timed
  - timed with splits
  - attempts / success rate
  - accuracy
  - distance
  - count
  - rating
  - custom fields
- Seed starter drills for flag football
- Drill detail/preview view

### Definition of done
- A valid drill JSON file can be imported without a code change.
- Invalid files show clear validation errors.
- Updating a drill creates a new definition version without rewriting historic results.

---

## Phase 3 — Train + timing

### Goal
Build the core field workflow.

### Deliverables
- Start Session flow
- DrillRunner driven by drill definition data
- Fast athlete selector
- Client-side stopwatch
- Split capture
- Manual result entry
- Attempt handling
- Save + Next Athlete action
- Retry / redo result
- Previous result + personal best context
- Session resume
- Local unsaved-result protection if connectivity drops

### Timing rules
- Stopwatch timing must run entirely in the browser.
- Use monotonic browser timing such as `performance.now()`.
- Never depend on network requests to start, stop, or record a split.
- Persist completed results only after timing is captured locally.

### Definition of done
- One coach can run a timed drill on an iPad without navigating away from the Train screen.
- Switching athletes and saving the next result requires minimal taps.
- Network latency does not affect recorded times.

---

## Phase 4 — History + data

### Goal
Turn captured results into useful athlete and team progress information.

### Deliverables
- Athlete profile
- Personal bests
- Result history
- Progress charts
- Drill leaderboards
- Team averages/trends
- Filters by athlete, drill, date, season/team
- Recent sessions
- Session detail

### Definition of done
- A coach can answer: “Is this athlete improving?” and “Who is fastest/best at this drill?” without exporting data.
- Charts remain simple and readable on tablet and phone.

---

## Phase 5 — Home + polish

### Goal
Create the simple launch surface and remove friction from repeated field use.

### Deliverables
- Home launch page
- Quick Start / recent drill
- Resume Last Session
- Roster snapshot
- Recent sessions
- PWA manifest/install support
- Loading, empty, offline, and error states
- Touch-target and tablet usability pass
- Basic accessibility pass
- Backup/export path for team results

### Home rule
Do not turn Home into an analytics dashboard. Progress charts, rankings, and detailed stats belong in Data.

### Definition of done
- Home gets the coach into a session quickly.
- App can be installed to an iPad/iPhone home screen.
- Core field workflows remain usable in weak connectivity.

---

## Phase 6 — Post-MVP only

Only consider these after real field use proves they are needed:

- Coach/user authentication and roles beyond the initial owner flow
- Multiple organizations
- Athlete photos
- CSV bulk roster import
- Parent/player portals
- Messaging
- Attendance
- Practice planning/calendar
- Video attachments
- Wearables or sensor integrations
- Advanced benchmarking
- Automated reports

These are explicitly not required for the first usable release.

---

## Suggested implementation order inside each phase

1. Data model / migration
2. API contract
3. Core logic
4. Reusable UI components
5. Screen workflow
6. Responsive behavior
7. Error/empty states
8. Tests
9. Deploy + field test

## Quality bar

Every phase should end with a deployable build. Avoid large branches that combine multiple phases. Prefer small PRs tied to one GitHub issue and one clear acceptance test.
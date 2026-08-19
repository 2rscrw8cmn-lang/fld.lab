# fld.LAB — Product & UX Specification

## 1. Purpose

fld.LAB is a coach-operated training and athlete performance tracker designed primarily for youth flag football.

The product should help a coach answer:

1. **What happened in today's drill?**
2. **Is this athlete getting better over time?**
3. **What are we running, and can I show it clearly?**

The app must be fast enough to use while standing on a field with an iPad or phone.

## 2. Primary user

**Coach / trainer**

The coach controls the device, selects drills, switches athletes, starts/stops timers, records attempts, reviews results, and maintains the team's working playbook.

Athletes do not need accounts for MVP.

## 3. Product principles

- **Fast beats feature-rich.** Field workflow is the priority.
- **One coach, many athletes.** Switching athletes must be immediate.
- **Low typing.** Most session actions should be tap-driven.
- **Dense browsing, large active controls.** Roster/Data are compact; Train is intentionally oversized.
- **Drills are configurable.** Adding a new drill should normally not require application code.
- **History is trustworthy.** Prior results remain tied to the athlete, session, and exact drill version that produced them.
- **Play diagrams are structured.** Football formations/routes should be modeled as football data, not generic freehand artwork.
- **Tablet first.** Design primarily for iPad landscape, then adapt to phone.
- **Store minimal youth-athlete information.** Only collect what the product needs.

## 4. Application structure

### Home

Purpose: launch work quickly.

Home should contain only:

- current team selector
- Start Training / Quick Start
- Resume Active Session when applicable
- Open Drill Library
- compact roster snapshot
- recent sessions

Do not put leaderboards, large trend charts, or analytical dashboards on Home.

### Roster

Purpose: manage the current season-specific team roster.

Requirements:

- compact table/list
- `+ Add Athlete`
- search/filter
- full row tappable
- edit/archive/reactivate
- target row height approximately 44–52 px
- no oversized athlete cards

Suggested visible tablet columns:

- jersey number
- athlete name
- positions
- row actions

The Add/Edit UI may present roster information in one form, but the underlying model separates:

#### Athlete identity

- first name — required
- last name — required
- birth year — optional
- status — active/inactive
- notes — optional

#### Team membership

- team — current season-specific roster
- jersey number — optional/recommended
- primary position — optional
- secondary position — optional
- membership active/inactive state

Database ownership is defined in `DATA_MODEL.md`: jersey number and positions belong to `TeamMembership`, not the global `Athlete` identity.

Avoid unnecessary personal data such as address, parent contact data, medical information, school, or full date of birth.

### Train

Purpose: capture results on the field.

Core flow:

1. choose drill
2. start/resume session
3. choose athlete
4. capture result
5. save
6. move immediately to next eligible athlete

Prioritize:

- drill name
- active athlete
- attempt progress
- previous result/PB when useful
- primary input or stopwatch
- one-tap Save + Next
- extremely fast athlete switching

For timed drills, timer and Start/Stop own the screen.

Athlete switching should use an already-loaded client queue. Avoid a modal or network request for every switch.

Exact states/edge cases are defined in `UX_FLOWS.md`.

### Data

Purpose: review progress.

Core views:

- athlete performance history
- personal bests
- drill trends over time
- team averages
- drill leaderboards
- athlete comparisons where useful

Filters may include:

- team
- athlete
- drill
- date range/season

Prefer one clear trend chart with underlying result history nearby.

### Playbook

Purpose: build and reference the small set of flag-football plays the current team actually uses.

Playbook should:

- start plays from football formation presets
- use clean structured route templates instead of generic freehand drawing
- allow direct player and route-endpoint adjustment on the field
- support motion and a primary target as separate football assignments
- support flip, duplicate, and duplicate + flip
- remain readable on a phone during practice or game day
- eventually produce wristband diagrams and a coach call sheet from the same structured play data

Do not turn Playbook into opponent scouting, game scheduling, messaging, or complex practice planning.

Detailed Playbook behavior is defined in `PLAYBOOK.md`.

### Drills

- drill library
- category/filtering
- drill detail
- import drill JSON
- update existing drill through a new definition version
- archive unused drills

The human-readable format is in `DRILL_SPEC.md`; machine validation is in `schemas/drill-definition.schema.json`.

### Settings

Keep minimal until requirements exist.

Potential future settings:

- team management
- default team
- display/measurement preferences
- account/session settings

## 5. Team/season decision

For MVP, a Team is season-specific, for example:

```text
U10 Purple — Fall 2026
```

Do not create a separate Season product hierarchy yet.

This keeps roster switching simple while preserving athlete identity across future teams.

## 6. Drill measurement types

Initial system supports:

- **time** — e.g. 20-yard sprint
- **time + splits** — same `time` measurement plus configured split keys
- **successes / attempts** — catches, flag pulls, accuracy
- **distance** — broad jump/throw distance
- **count** — reps
- **rating** — coach score
- **custom numeric fields** — deliberately limited escape hatch

The canonical schema enum for timed drills is `time`.

A drill may define multiple attempts and an aggregation such as best, average, latest, or total.

## 7. Suggested starter drill library

Exact production drills should be confirmed with the coach.

Useful U10 examples:

### Speed / agility

- 10-Yard Sprint
- 20-Yard Sprint
- 5-10-5 Shuttle
- Cone Zig-Zag

### Football skills

- Flag-Pull Alley
- Quick Catch
- Moving Catch
- Route + Catch
- QB Accuracy
- Throwing Distance
- Center Snap Accuracy

### Defensive movement

- Mirror Drill
- Backpedal → Break
- Pursuit / Flag Pull

Not every practice drill needs recorded data. fld.LAB should focus on results worth comparing over time.

## 8. Timing UX requirements

- Start requires one obvious tap.
- Stop is a large target.
- Split controls appear only when defined.
- Timer derives elapsed time from a monotonic browser clock.
- Saving is never part of the timing path.
- After Stop, coach reviews, saves, redoes, or edits before persistence/advance.
- Athlete switching is disabled while a timer is actively running.
- Completed local results are never silently lost because of a network failure.

See `UX_FLOWS.md` and `TECHNICAL.md`.

## 9. Responsive behavior

### Tablet landscape — primary

- persistent left navigation acceptable
- dense tables
- multi-column layouts where useful
- Train retains large controls
- Playbook editor can use field + contextual controls side by side

### Phone

- navigation may collapse
- roster becomes dense rows rather than tall cards
- secondary metadata may hide
- Train controls remain large
- Playbook keeps the field dominant and moves contextual controls below it
- no horizontal roster dependence

## 10. MVP

First usable training release:

- one or more season-specific teams
- roster CRUD
- drill library
- drill JSON import/versioning
- training sessions
- timed drills
- basic non-timed result entry
- fast athlete switching
- result history
- personal best calculation
- simple progress chart
- drill leaderboard

Playbook is an active post-MVP product surface and follows `PLAYBOOK.md` rather than expanding the training MVP definition above.

## 11. Explicit non-goals for MVP

Do not build unless direction changes:

- league scheduling
- game scoring
- chat/team messaging
- parent portal
- payments
- attendance management
- medical records
- complex practice programming
- social feed
- athlete self-service accounts
- video analysis
- separate organizations/club hierarchy

## 12. Working brand direction

- Name: **fld.LAB**
- Primary: purple
- Secondary/foundation: deep midnight/navy
- Dark interface
- Sports-performance rather than youth-cartoon aesthetic
- Clean line icons
- Compact UI outside active testing

See `DESIGN_SYSTEM.md`.

## 13. Privacy and production access

Development can use fictional data without authentication.

Because real use involves youth-athlete names/results, do not place real athlete data on an anonymously accessible internet deployment.

Production access requirements are defined in `SECURITY.md`.

## 14. Success test

The training system succeeds when a coach can:

> open fld.LAB on an iPad, choose a drill, cycle through a roster, record every athlete's result without slowing practice, and later see who improved.

Playbook succeeds when a coach can:

> choose a formation, build a clean readable play in under a minute, mirror or duplicate it without redrawing, and pull it up quickly on a phone during practice or a game.

If a feature does not help one of those workflows, question it before adding it.
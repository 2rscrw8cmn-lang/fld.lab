# fld.LAB — Product & UX Specification

## 1. Purpose

fld.LAB is a coach-operated training and athlete performance tracker designed primarily for youth flag football.

The product should help a coach answer two questions:

1. **What happened in today's drill?**
2. **Is this athlete getting better over time?**

The app should be fast enough to use while standing on a field with an iPad or phone.

## 2. Primary user

**Coach / trainer**

The coach controls the device, selects drills, switches between athletes, starts/stops timers, records attempts, and reviews results.

Athletes do not need accounts for the MVP.

## 3. Product principles

- **Fast beats feature-rich.** Field workflow is the priority.
- **One coach, many athletes.** Switching athletes must be immediate.
- **Low typing.** Most session actions should be tap-driven.
- **Dense browsing, large active controls.** Roster and Data are compact; Train is intentionally oversized.
- **Drills are configurable.** Adding a new drill should not normally require application code.
- **History is trustworthy.** Prior results remain tied to the drill version and athlete that produced them.
- **Tablet first.** Design primarily for iPad landscape, then adapt downward to phones.

## 4. Application structure

### Primary surfaces

#### Home
Purpose: launch work quickly.

Home should contain only:
- current team selector
- Start Training / Quick Start
- Resume Last Session when applicable
- Open Drill Library
- compact roster snapshot
- recent sessions

Do not put leaderboards, trend charts, or large analytical dashboards on Home.

#### Roster
Purpose: manage athletes and enter athlete history.

Requirements:
- compact table/list
- `+ Add Athlete` action
- search/filter
- full row is tappable
- edit/archive from row actions or athlete profile
- target row height approximately 44–52 px
- no oversized athlete cards

Suggested visible columns on tablet:
- jersey number
- athlete name
- positions
- team when useful
- row actions

Suggested athlete fields:
- first name — required
- last name — required
- jersey number — recommended
- team — required when multiple teams exist
- primary position — optional
- secondary position — optional
- birth year / age group — optional
- status — active/inactive
- notes — optional

Avoid unnecessary personal data in the MVP such as address, parent contact data, medical information, or full date of birth.

#### Train
Purpose: capture results on the field.

This is the most important screen in the product.

Core flow:
1. choose drill
2. start session
3. choose athlete
4. capture result
5. save
6. move immediately to next athlete

The screen should prioritize:
- drill name
- active athlete
- previous result / personal best when useful
- primary input or stopwatch
- one-tap Save + Next
- extremely fast athlete switching

For timed drills, the timer and Start/Stop controls own the screen.

Athlete switching should work through a compact horizontal selector and/or next/previous controls. Avoid opening a modal for every switch.

#### Data
Purpose: review progress.

Core views:
- athlete performance history
- personal bests
- drill trends over time
- team averages
- drill leaderboards
- athlete comparisons when useful

Filters should support:
- team
- athlete
- drill
- date range / season

Keep charts simple. Prefer one clear trend chart with the underlying result history directly below it.

### Supporting surfaces

#### Drills
- drill library
- category/filtering
- drill detail
- import new drill definition
- update an existing drill by importing a newer definition version
- archive drills that are no longer used

#### Settings
Keep minimal until real requirements appear.

Potential settings:
- team management
- default team
- measurement/display preferences
- account/session settings

## 5. Drill measurement types

The initial drill system should be capable of rendering:

- **time** — e.g. 20-yard sprint
- **time + splits** — e.g. 20-yard sprint with 10-yard split
- **successes / attempts** — e.g. 8 catches of 10
- **accuracy** — e.g. QB target hits
- **distance** — e.g. broad jump
- **count** — e.g. reps in 30 seconds
- **rating** — e.g. coach score 1–5
- **custom numeric fields** — for future drill variations

A drill can define multiple attempts and determine whether the displayed result is best, average, latest, total, or another supported aggregation.

## 6. Suggested starter drill library

The exact library should be confirmed with the coach, but useful U10 flag football examples include:

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

Not every practice drill needs recorded data. fld.LAB should focus on the drills where tracking results over time is actually useful.

## 7. Timing UX requirements

For a timed drill:

- Start must require one obvious tap.
- Stop must be a large touch target.
- Split controls appear only when the drill defines splits.
- Timer continues to derive elapsed time accurately even if the visual display skips frames.
- Saving must never be part of the timing path.
- After stopping, coach can Save + Next, redo, or edit the result.
- Previous result and PB may be shown without competing with the stopwatch.

## 8. Responsive behavior

### Tablet landscape — primary
- persistent left navigation is acceptable
- dense tables
- multi-column layouts where they improve scanning
- Train still uses large targets

### Phone
- navigation may collapse to a bottom bar or compact menu
- tables collapse into 44–52 px rows rather than tall cards
- secondary metadata may be hidden
- active Train controls remain large

## 9. MVP

The first usable version should include:

- one or more teams
- roster CRUD
- drill library
- drill JSON import
- training sessions
- timed drills
- basic non-timed result entry
- fast athlete switching
- result history
- personal best calculation
- simple progress chart
- drill leaderboard

## 10. Explicit non-goals for MVP

Do not build these unless the product direction changes:

- league scheduling
- game scoring
- chat or team messaging
- parent portal
- payments
- attendance management
- medical records
- complex practice-plan programming
- social feed
- athlete self-service accounts
- video analysis

## 11. Working brand direction

- Name: **fld.LAB**
- Primary: purple
- Secondary: deep midnight / navy
- Dark interface direction
- Sports-performance rather than youth-cartoon aesthetic
- Clean line icons
- Compact UI outside active testing

## 12. MVP success test

The app is successful when a coach can:

> open fld.LAB on an iPad, choose a drill, cycle through a roster, record every athlete's result without slowing down practice, and later see who improved.

If a feature does not help that workflow, it should be questioned before it is added.

# fld.LAB — UX Flows

This document defines screen states and interaction behavior that should not be left to implementation guesswork.

## 1. Global navigation

Primary areas:

```text
Home | Roster | Train | Data | Drills | Settings
```

Tablet landscape may use persistent left navigation.

Phone may use a compact/bottom navigation pattern.

Do not create additional top-level navigation without a product requirement.

## 2. Global team context

The current team is a global app context.

Rules:

- If only one active team exists, select it automatically.
- If multiple teams exist, remember the last selected team on that device/browser.
- Switching teams updates Home, Roster, Train, and Data context.
- Do not allow a team switch while a stopwatch is actively running.
- If an active training session exists for the current team, switching teams requires leaving/resolving that session first.

## 3. Loading, empty, and error states

Every data-backed screen needs four intentional states:

1. loading
2. populated
3. empty
4. error/retry

Avoid blank screens and indefinite spinners.

### Loading

Use lightweight skeleton/placeholder rows where useful. Do not block the entire shell when only one panel is loading.

### Empty

Empty states should lead to the next useful action.

Examples:

- no teams → `Create Team`
- empty roster → `Add Athlete`
- no drills → `Import Drill`
- no sessions/results → explain that results appear after training

### Error

Show a plain-language message plus Retry when retry is possible.

Do not erase already-entered form/session data because a read/write fails.

## 4. Home

Home is a launch surface, not an analytics dashboard.

Recommended order:

1. team selector/header
2. Start Training
3. Resume Active Session when applicable
4. recent/favorite drills
5. compact roster snapshot
6. recent sessions

Do not put leaderboards or large progress charts on Home.

### Start Training

Tap `Start Training`:

1. choose drill
2. confirm current team
3. create/start session
4. load athlete queue
5. enter Train ready state

If there is already an active session for that team, surface `Resume Session` rather than silently creating a competing session.

## 5. Roster

Tablet roster is a compact table.

Visible row fields:

- jersey number
- athlete name
- primary/secondary position
- optional team context when useful
- row action menu

Row height target: 44–52 px.

### Add Athlete

`+ Add Athlete` opens a sheet/dialog without leaving Roster.

MVP fields:

#### Athlete identity

- first name — required
- last name — required
- birth year — optional
- notes — optional

#### Current team membership

- jersey number — optional
- primary position — optional
- secondary position — optional

On Save:

1. validate locally
2. send one roster-create request
3. server creates Athlete + TeamMembership transactionally
4. close sheet after success
5. new row appears in roster

If save fails, keep the form open with entered values intact.

### Edit Athlete

Editing may expose identity and team-membership fields in one UI, but API/database ownership remains separate.

Do not move jersey number/position fields onto the `Athlete` record for convenience.

### Archive from roster

Archive means the athlete is removed from the active roster context without deleting history.

Require a confirmation for archive.

After archive:

- remove/mute from active roster
- historical results remain available
- allow reactivation

## 6. Drill library

Drill list should be compact and filterable by category.

Each row may show:

- icon
- name
- category
- measurement type
- active/archived state

### Import Drill

1. choose JSON file
2. parse/validate locally for immediate feedback
3. send to server
4. server validates again against the supported schema
5. show New Drill or New Version summary
6. confirm/import
7. return to drill library

Unknown icon keys should not block import.

Invalid behavior fields must block import with field-level errors.

## 7. Train — session states

Train has these primary states:

```text
NO_SESSION
READY
RUNNING
STOPPED_REVIEW
SAVING
ACTIVE_NEXT
SESSION_COMPLETE_READY
```

The visible UI may combine some states, but behavior should follow this model.

## 8. Train — ready state

Show:

- drill name
- active athlete
- athlete queue/switcher
- attempt progress, e.g. `Attempt 1 of 2`
- previous result / PB when available
- primary Start or result-entry control

Athlete switching is immediate because the queue is already in client state.

No network request is required merely to select another athlete.

## 9. Athlete switching rules

### When timer is not running

Coach may switch athletes freely.

### While timer is running

Do **not** switch athletes directly.

Athlete selector is disabled or visually unavailable while RUNNING.

Coach must first:

- Stop, or
- Cancel/Reset the active attempt

This prevents a result from being accidentally assigned to the wrong athlete.

### After a saved attempt

`Save + Next` advances to the next athlete who still needs an attempt.

Queue logic:

1. move forward through roster order
2. skip athletes already complete for the drill
3. wrap to the beginning when necessary
4. continue until all required attempts are complete or athletes are skipped

This supports multiple rounds naturally. For a two-attempt drill, the coach can run Attempt 1 across the roster and the queue will later return to athletes needing Attempt 2.

A secondary `Save + Stay` action may keep the current athlete selected when the coach wants consecutive attempts.

## 10. Timed attempt

### READY → RUNNING

Tap Start:

- record monotonic `startTimestamp`
- reset split state
- timer display begins
- disable athlete switching
- Start becomes Stop

No API call is required to begin timing.

### RUNNING → split

If drill defines splits:

- Split button records elapsed milliseconds from original start
- split is stored in local attempt state
- repeated split for the same configured key is not allowed unless future schema explicitly supports it

### RUNNING → STOPPED_REVIEW

Tap Stop:

- calculate final elapsed milliseconds locally
- freeze display
- show review actions

Stopping does **not** immediately persist and does not automatically move athletes.

## 11. Stopped/review state

After Stop, show:

- captured result
- captured splits
- active athlete
- attempt number
- PB/previous comparison if useful

Primary actions:

- `Save + Next`
- `Save + Stay` when useful

Secondary actions:

- `Redo`
- `Edit Result`
- `Cancel Attempt`

### Accidental Stop

Use `Redo`.

Redo discards the unsaved stopped attempt and returns to READY for the same athlete/attempt number.

### Edit Result

Manual correction is allowed **before saving**.

For time values, editing changes the local captured result and should be visually marked as manually edited in client state if practical.

An audit log is not required for MVP.

## 12. Non-timed result entry

Drill definition determines the renderer:

- successes/attempts
- distance
- count
- rating
- custom numeric fields

The coach enters the value and sees the same review/save pattern as a timed result.

Do not require a separate page per measurement type.

## 13. Save + Next behavior

When coach taps `Save + Next`:

1. completed attempt is committed to local session state immediately
2. UI advances to the next eligible athlete without waiting for network
3. persistence request starts in background
4. saved attempt is marked `pending`, `saved`, or `failed`
5. failed save remains retryable and associated with the correct athlete/session

Never assign the result to the newly selected athlete because the network response returned late.

Each queued write carries stable session ID, athlete ID, and client attempt identity.

## 14. Save failure

If persistence fails:

- do not interrupt a currently running timer with a modal
- show a persistent but restrained `Unsaved results` indicator
- retain the result in client state
- allow Retry
- prevent session finalization from silently claiming success while failed writes exist

If the browser is about to unload with unsaved results or a running timer, show a browser-supported leave warning where possible.

Full offline-first synchronization across browser restarts is not required for the initial MVP.

## 15. Skip athlete

Coach can mark the active athlete `Skipped` when they will not complete the drill.

Skip:

- does not create a zero/result
- excludes athlete from PB/leaderboard calculations for that session
- moves to next eligible athlete
- can be reversed while the session remains active

## 16. Session completion

When all athletes are complete or skipped:

show `Session Complete` state with:

- completed athlete count
- skipped count
- unsaved/failed write count, if any
- Finish Session action

### Finish Session

Allowed when no active timer exists.

If failed/unsaved writes exist, show them clearly and require retry or an explicit choice to leave the session active. Do not mark the session completed while silently losing attempts.

On successful finish:

- mark session completed
- return to session summary or Home

## 17. Abandon session

If coach intentionally ends an incomplete session:

- confirm action
- mark session `abandoned`
- keep already saved attempts/history
- do not delete captured results

## 18. Resume session

An active session can be resumed from Home or Train.

Restore:

- team
- drill + exact drill version
- athlete queue/order
- complete/skipped states
- saved attempt counts

Do not substitute the latest drill version into a session that began on an older version.

If unsaved results existed only in volatile browser state and are no longer available, do not fabricate them.

## 19. Data / athlete profile

Athlete profile should answer:

- what is the athlete's latest result?
- what is their personal best?
- are they improving?

Recommended drill-detail view:

1. drill name
2. PB
3. latest result
4. simple trend chart
5. chronological result list

Underlying result list should remain available even when a chart is shown.

## 20. Data / leaderboard

Leaderboard:

- select team
- select drill
- rank valid results according to drill direction
- lower first for `lower`
- higher first for `higher`
- no ranking when direction is `none`

Use list/table presentation rather than decorative charts.

## 21. Destructive behavior

Actions that may remove access to historical context require confirmation:

- archive athlete/membership
- archive drill
- abandon session
- explicit corrective deletion of a session/result

Normal editing should not hard-delete history.

## 22. Field usability rule

When a workflow decision conflicts with generic dashboard conventions, prioritize this question:

> Can one coach operate this quickly from an iPad while athletes are moving through a drill?

If not, simplify the workflow.
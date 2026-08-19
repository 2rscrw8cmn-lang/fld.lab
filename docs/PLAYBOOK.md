# fld.LAB — Playbook Specification

## Purpose

Playbook is a coach-facing flag-football diagram and game-day reference tool. It should help a coach build a small, usable team playbook quickly on a phone or tablet.

Playbook is not a generic drawing canvas and should not become a broad practice-planning or league-management system.

## Product principles

- Football structure beats freehand drawing.
- Start from a formation instead of a blank field.
- The field stays visually dominant; controls stay compact and contextual.
- A play is structured data, not an image or SVG blob.
- The same structured play should eventually render as an editor diagram, library thumbnail, mirrored play, wristband card, and player-facing diagram.
- Default workflows target 5v5 youth flag football while leaving room for custom player placement.
- Team playbooks should stay intentionally small and easy to scan.

## Phase 1 — editor interaction

### New play

A new offensive play begins by choosing a formation preset. Initial presets:

- Spread
- Trips Right
- Trips Left
- Bunch Right
- Bunch Left
- Stack Right
- Stack Left
- Custom

A coach may drag players after choosing a preset.

### Players

- Position markers use football-role labels such as `X`, `Y`, `Z`, `C`, and `QB`.
- Dragging a player moves that player and its assignments together.
- Labels remain editable.
- The play stores position roles, not athlete identity. Roster-to-position personnel mapping is a later layer.

### Routes

Freehand drawing is not the default route workflow.

Select a player, then choose a route template:

- Go
- Slant
- Out
- In
- Post
- Corner
- Hitch
- Drag

fld.LAB creates clean football geometry automatically. The coach adjusts the route by dragging its endpoint; the template preserves the expected geometry while depth and direction change.

Route semantics stay locked while adjusting. For example, an Out remains outside and square even if the coach drags the endpoint across the formation; changing to an In is an explicit route-template choice.

A player has at most one primary route assignment. Choosing another route replaces that player's current route.

Normal route ink is neutral rather than accent-colored. Purple is reserved for active selection and interaction state. Motion remains visually quieter and dashed.

### Motion

Motion is a separate pre-snap assignment and renders as a dashed path. It is not stored as a route style.

### Primary target

An offensive play may identify one primary target. This is semantic play data, not decorative markup.

### Editing controls

The editor supports:

- undo
- redo
- flip horizontally
- duplicate
- duplicate + flip
- clear selected assignments
- change formation

Changing formation resets player placement and assignments.

### Field

The field is a compact coaching diagram, not a full stadium field. It should show:

- line of scrimmage
- short yardage references
- a 7-yard rush reference
- enough vertical field to read route depth

Field guides remain quieter than player markers and assignment lines.

### Diagram data

Coordinates are normalized from `0` to `100`, never screen pixels.

```ts
type PlayDiagram = {
  schema_version: 2;
  players: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
  }>;
  assignments: Array<{
    id: string;
    player_id: string;
    kind: "route" | "motion";
    template?: "go" | "slant" | "out" | "in" | "post" | "corner" | "hitch" | "drag";
    points: Array<{ x: number; y: number }>;
  }>;
  primary_target_player_id: string | null;
};
```

Rules:

- coordinates are finite and clamped to the field
- assignment player IDs must reference an existing player
- route/motion assignments contain at least two points
- route templates produce clean geometry rather than sampled freehand points
- existing schema-v1 browser plays should be migrated when possible rather than silently discarded

## Persistence

D1 is the authoritative source of truth for team playbooks.

Each stored play belongs to exactly one team and contains:

- `id`
- `team_id`
- `name`
- `side`
- `formation_id`
- `formation`
- `play_type`
- `concept`
- `situation`
- `active_play`
- `notes`
- `diagram_json`
- `archived`
- `created_at`
- `updated_at`

Rules:

- play access follows the existing authenticated TeamCoach permission model
- coaches with team access may read and edit the team's plays
- inaccessible team playbooks return the same not-found behavior as other team-scoped resources
- archive instead of destructive delete
- the server validates schema-v2 diagram structure before persistence
- new persistent IDs are generated server-side
- browser storage may be retained temporarily only as a migration/cache fallback; it is not the authoritative source after D1 persistence is active

## Phase 2 — playbook organization

### Active Plays vs Library

The team playbook has two working states:

- **Active Plays** — the small set the team is currently installing/running
- **Library** — valid saved plays retained for later, but not in the current active set

This is separate from archival. A Library play is still a normal saved play, but the normal Library interaction is view-only. Archived plays are removed from normal Playbook browsing.

New plays default to Active. A coach may toggle `active_play` in the editor.

### Play viewer

Opening a play should prioritize consuming the play, not editing it.

- tapping an Active or Library card opens the play viewer first
- the field is the dominant surface
- normal routes are thin neutral lines; motion is quieter and dashed
- purple is reserved for the primary target and active interaction/progress state
- field guides are intentionally subdued
- playback controls sit outside the field so they do not cover route geometry
- metadata is presented as compact text rather than a stack of badges/cards
- the viewer supports Run Play, Pause, Resume, and Replay
- pre-snap motion completes before route movement begins
- Active plays expose an explicit Edit action
- Library plays do not expose editor controls; they must be moved back to Active before editing

The same viewer should become the basis of the game-day/sideline play surface rather than creating a second visualization system.

### Football metadata

Each play stores compact football-specific organization fields:

- `play_type` — `pass | run | option`
- `concept` — short coach-entered label such as `Flood`, `Mesh`, or `Slant`
- `situation` — `any | short | medium | deep | no-run | goal-line | conversion`

These fields are intentionally shallow. Do not introduce nested folders or a general tagging system before field use proves a need.

Library cards should surface the useful metadata without turning into tall generic cards.

### Still in Phase 2

- roster personnel mapping to position roles
- defensive man/zone/rush assignment tools
- archive/restore UI

## Phase 3 — game day

- play numbering
- coach call sheet
- wristband sheet generation
- print/PDF layouts
- fast sideline viewer

## Deferred

Do not prioritize these before the structured editor and game-day outputs work well:

- AI play generation
- public play marketplace
- video attachments
- player accounts/quizzes
- deep folder hierarchies

## Product boundary

Playbook is a coaching reference tool inside fld.LAB. It should stay fast and visual. It must not expand into league administration, game scheduling, parent communication, or a general team-management suite.

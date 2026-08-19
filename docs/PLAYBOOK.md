# fld.LAB — Playbook Specification

## Purpose

Playbook is a coach-facing flag-football diagram and game-day reference tool. It should help a coach build a small, usable team playbook quickly on a phone or tablet.

Playbook is not a generic drawing canvas and should not become a broad practice-planning or league-management system.

## Product principles

- Football structure beats freehand drawing.
- Start from a formation instead of a blank field.
- The field stays visually dominant; controls stay compact and contextual.
- A play is structured data, not an image or SVG blob.
- The same structured play renders as an editor diagram, library thumbnail, mirrored play, animated viewer, wristband insert, and call-sheet diagram.
- A Team may own multiple Playbooks when the same roster competes in different leagues or formats.
- Playbooks support both **5v5** and **6v6** flag football.
- Team playbooks should stay intentionally small and easy to scan.

## Playbook organization

A Team owns one or more Playbooks. A Playbook owns Plays.

```text
Team
  └── Playbook (5v5 or 6v6)
        └── Play
```

Each Playbook has:

- `id`
- `team_id`
- `name`
- `format` — `5v5 | 6v6`
- `archived`
- timestamps

The Playbook format is structural configuration rather than an everyday filter. It controls formation presets and the expected default player count. The Team roster remains shared, so the same athletes may be assigned to Plays in either format.

The selected Playbook scopes **Editor**, **Library**, personnel assignment, animation, and **Game Day** outputs. Plays from different Playbooks must never mix in the same Library or Game Day set.

When multiple-Playbook support is introduced, every existing Team receives a default **5v5 Playbook**, and existing Plays migrate into it without changing their diagrams or personnel assignments.

## Phase 1 — editor interaction

### New play and formation presets

A new play begins by choosing a formation preset from the selected Playbook's format.

Both 5v5 and 6v6 offer the same core offensive preset families:

- Spread
- Trips Right
- Trips Left
- Bunch Right
- Bunch Left
- Stack Right
- Stack Left
- Custom

Default 5v5 offensive roles are `QB`, `C`, `X`, `Y`, and `Z`.

Default 6v6 offensive roles are `QB`, `C`, `X`, `Y`, `Z`, and `H`.

Defensive Man and Zone Shell starting presets are also format-specific so the correct number of defenders is created automatically.

A coach may drag players after choosing a preset.

### Players

- Position markers use football-role labels such as `X`, `Y`, `Z`, `H`, `C`, and `QB`.
- Dragging a player moves that player and its assignments together.
- Offensive players may not be dragged across the line of scrimmage onto the defensive side.
- Defensive players may not be dragged across the line of scrimmage onto the offensive side.
- Motion endpoints also stay on the player's pre-snap side of the line of scrimmage.
- Labels remain editable.
- The play stores position roles, not athlete identity. Personnel mapping is a separate roster layer.
- Standard position roles use stable, distinct colors so routes remain easy to follow when they cross.
- The primary target overrides its normal position color with fld.LAB purple.
- Color is supplemental; player labels remain visible so state never depends on color alone.

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
- **Wheel**

Route choices use compact route-shape glyphs instead of a wall of equally weighted text buttons. The selected player's color provides contextual emphasis while purple remains reserved for the primary target.

fld.LAB creates clean football geometry automatically. The coach may tap an existing route line to select it. A selected route exposes draggable handles so the line can be adjusted after it has been created.

Dragging the endpoint of a template route preserves the expected football semantics while depth and direction change. Interior handles may be moved directly when the coach needs a custom adjustment.

Route semantics stay locked for smart endpoint adjustment. For example, an Out remains outside and square even if the coach drags the endpoint across the formation; changing to an In is an explicit route-template choice.

#### Wheel route

Wheel is a curved route, not pre-snap motion.

- it begins by releasing flat/outside from the player's starting position
- it bends smoothly upfield and may cross the LOS like any other route
- it is stored as an eight-point sampled curve so the same structured data works in the editor, animation, thumbnails, call sheets, and wristbands
- dragging the endpoint regenerates the curve while preserving outside/upfield Wheel semantics
- the sampled interior points remain editable using the existing route handles
- a backfield player may therefore remain behind the LOS during the initial part of the Wheel before turning upfield

Motion remains a separate pre-snap concept and is still constrained to the player's pre-snap side of the LOS.

A player has at most one primary route assignment. Choosing another route replaces that player's current route. Choosing the already-active route selects its existing line for adjustment instead of recreating it.

Route ink follows the assigned player's color at restrained opacity. The primary target and its route use purple. Motion remains visually quieter and dashed. Arrowheads must stay large enough to read route direction at a glance even when the route stroke itself is thin.

### Motion

Motion is a separate pre-snap assignment and renders as a dashed path. It is not stored as a route style.

Motion may be selected and adjusted directly on the field. During playback, a player's route begins from the completed motion endpoint so the animated player and displayed route remain aligned.

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
- direct selection and adjustment of existing route/motion lines

Changing formation resets player placement and assignments.

Editor controls should be visually grouped by purpose rather than presented as one undifferentiated control wall. Player/route tools, pre-snap/read tools, play setup, and coaching notes should read as separate groups.

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
    template?: "go" | "slant" | "out" | "in" | "post" | "corner" | "hitch" | "drag" | "wheel";
    points: Array<{ x: number; y: number }>;
  }>;
  primary_target_player_id: string | null;
};
```

Rules:

- coordinates are finite and clamped to the field
- pre-snap player placement remains on the correct side of the line of scrimmage
- assignment player IDs must reference an existing player
- route/motion assignments contain at least two points and no more than eight in schema v2
- route templates produce controlled football geometry rather than sampled freehand drawing
- Wheel intentionally uses the full eight-point allowance to approximate a smooth curved path
- existing schema-v1 browser plays should be migrated when possible rather than silently discarded

## Persistence

D1 is the authoritative source of truth for team Playbooks and Plays.

Each stored Play belongs to exactly one Team and one Playbook and contains:

- `id`
- `team_id`
- `playbook_id`
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

`active_play` remains the persistence field for compatibility, but the product language is **Editor** vs **Library**.

Personnel is stored separately from the play diagram. A personnel row binds one play diagram `player_id` to one Team `athlete_id`. The Play remains valid and reusable without personnel assignments.

Rules:

- Playbook and Play access follow the existing authenticated TeamCoach permission model
- coaches with team access may read and edit the Team's Playbooks and Plays
- a Playbook referenced by a Play must belong to the same authorized Team
- inaccessible team Playbooks return the same not-found behavior as other team-scoped resources
- archive instead of destructive delete
- the server validates schema-v2 diagram structure before persistence
- new persistent IDs are generated server-side
- personnel assignments may only reference player IDs in the saved Play diagram and active athletes on the same Team
- one athlete may fill at most one position within a Play
- browser storage may be retained temporarily only as a migration/cache fallback; fallback caches are partitioned by Playbook

## Phase 2 — Editor and Library

Each selected Playbook has two working states with deliberately different jobs:

- **Editor** — build and change the football structure: formation, player placement, routes, motion, primary target, metadata, notes, duplicate, and flip
- **Library** — consume the finished play: clean viewer, animation, and roster personnel assignment

This is separate from archival. A Library play is still a normal saved play. Its football diagram and setup are locked; move it back to Editor when the concept itself needs to change. Personnel is intentionally managed in Library because it is a team/use layer over a reusable football concept.

New plays default to Editor. The UI may continue storing this state in the existing `active_play` field until a future data migration gives the concept a better persistence name.

Editor cards open directly into the editor. Library cards open into the play viewer. Moving a finished play to Library is an Editor-card action, not an in-editor control.

### Play viewer

Opening a Library play should prioritize consuming and assigning the play, not diagram editing.

- the field is the dominant surface
- player markers use stable position colors; the primary target is purple
- route traces inherit their player's color at restrained opacity
- motion is quieter and dashed
- a route following motion is rendered from the completed motion position
- Wheel animation follows the same sampled curve stored in the Play
- field guides are intentionally subdued
- playback controls sit outside the field so they do not cover route geometry
- metadata is presented as compact text rather than a stack of badges/cards
- the viewer supports Run Play, Pause, Resume, and Replay
- playback begins with a brief set/snap hold, then pre-snap motion completes before route movement begins
- default playback should feel quick enough for sideline review rather than slow-motion analysis
- Library thumbnails show position labels so diagrams remain useful at a glance

### Personnel mapping

A Play keeps football roles and roster personnel as separate layers.

- diagram players remain `X`, `Y`, `Z`, `H`, `C`, `QB`, or other coach-defined labels
- personnel is assigned from the **Library**, not while building the diagram in Editor
- each diagram player may optionally map to an active athlete on the Team roster
- an athlete may only occupy one diagram position in the same Play
- Library keeps the diagram itself locked while allowing personnel assignments to change
- the Library viewer uses a distinct **Assign players** / **Edit assignments** action rather than a generic manage link
- the viewer can switch between **Positions** and **Players** without changing route geometry or route color
- route colors remain tied to the football role; swapping an athlete does not change the visual language of the concept
- in Players mode, the marker uses the athlete jersey number when available and shows the athlete first name adjacent to the marker
- personnel data feeds wristband and call-sheet outputs

Personnel mapping should never make a generic Play unusable. Unassigned positions continue to display their football role.

### Football metadata

Each Play stores compact football-specific organization fields:

- `play_type` — `pass | run | option`
- `concept` — short coach-entered label such as `Flood`, `Mesh`, or `Slant`
- `situation` — `any | short | medium | deep | no-run | goal-line | conversion`

These fields are intentionally shallow. Do not introduce nested folders or a general tagging system before field use proves a need.

### Still in Phase 2

- defensive man/zone/rush assignment tools
- archive/restore UI

## Phase 3 — game day

Game Day turns finished Library Plays from the **currently selected Playbook** into numbered sideline outputs. Numbering is output-level selection/order rather than permanent Play data in the first implementation.

### Game-day set

- choose which Library Plays are included
- reorder the selected Plays and number them continuously from `1..N`
- use the same numbering in call sheets and wristband inserts
- switch between football-position labels and saved roster/jersey labels without changing play geometry

### Coach call sheet

The call sheet is a dense coaching reference, not a printout of Library cards.

- use a landscape letter page
- target up to 12 Plays per page in a three-column grid
- keep play number, name, formation, type/concept/situation, notes, and a compact diagram together
- crop the print diagram around the actual formation/routes rather than reproducing the full editor field
- remove preparation-only status such as personnel completeness from the finished coaching artifact
- repeat the fld.LAB wordmark, Team identity, document label, and page count in a compact branded header

### Wristband inserts

Wristband output is a sheet of physical cut-ready inserts, not one oversized card per Play.

- one insert contains a numbered multi-Play grid
- supported densities are 6, 8, or 12 Plays per insert
- larger selected Play sets continue onto additional numbered insert sets
- each printed portrait page produces eight identical copies of the current insert set for players/coaches
- every insert carries a small fld.LAB wordmark and Team identity once; branding is not repeated inside every Play cell
- play cells prioritize number, short name, formation, and a tightly cropped diagram
- cut boundaries stay visible but quiet

### Print diagrams

Call sheets and wristbands use a game-day-specific static renderer derived from the same structured Play data.

- dynamically crop unused field space
- preserve LOS and route direction while dropping nonessential full-field decoration
- routes remain color-matched to roles and the primary target stays purple
- player markers are smaller than in the editor so route geometry remains dominant
- motion stays dashed and a route following motion begins from the completed motion position
- sampled Wheel geometry is printed directly, so the curve remains consistent with editor/viewer behavior

Browser print remains the export path for the first implementation so coaches can print directly or choose **Save as PDF**.

### Still in Phase 3

- fast sideline viewer optimized for rapid play calling
- field testing against specific physical wrist-coach window dimensions

## Deferred

Do not prioritize these before the structured editor and game-day outputs work well:

- AI play generation
- public play marketplace
- video attachments
- player accounts/quizzes
- deep folder hierarchies

## Product boundary

Playbook is a coaching reference tool inside fld.LAB. It should stay fast and visual. It must not expand into league administration, game scheduling, parent communication, or a general team-management suite.

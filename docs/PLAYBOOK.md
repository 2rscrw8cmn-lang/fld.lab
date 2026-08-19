# fld.LAB — Playbook v1

## Purpose

Playbook gives a flag-football coach a fast way to draw, organize, and reference plays inside fld.LAB without turning the product into a game-management platform.

The primary jobs are:

1. sketch a play quickly
2. save it to the current team
3. find it again during practice
4. show the diagram clearly on a phone or tablet

## Scope

### v1 includes

- a top-level Playbook surface
- team-specific plays
- offense and defense play types
- play name
- optional formation name
- optional notes
- draggable player markers
- editable player labels
- drawn routes
- dashed motion paths
- compact play-library previews
- archive instead of destructive delete when persistence is added

### v1 does not include

- game scheduling
- opponent scouting
- play-calling statistics
- messaging players/parents
- video
- animation/timeline playback
- assignments tied to athlete accounts
- formation packages or complex practice planning
- public play sharing

## Interaction model

### Playbook library

The current team owns the visible playbook.

The library should support:

- All / Offense / Defense filtering
- `New Play`
- tap a play to edit it
- a field-diagram preview on each play
- play name, side, formation, and updated time

Phone layouts remain compact. Avoid tall generic cards with large metadata blocks.

### Editor

The editor should prioritize the field.

Core actions:

- drag a player to reposition
- tap a player to select it
- edit the selected player label
- draw a route for the selected player
- draw a motion path for the selected player
- clear the selected player's routes
- add/remove player markers
- edit play name, side, formation, and notes
- save and return to the library

A newly created offensive play starts with a useful 5v5 template:

- QB
- C
- X
- Y
- Z

These are editable labels, not roster assignments.

## Diagram data

Diagrams use normalized coordinates from `0` to `100`, never screen pixels. This keeps the same play usable on phone, tablet, and desktop.

```ts
type PlayDiagram = {
  schema_version: 1;
  players: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
  }>;
  paths: Array<{
    id: string;
    player_id: string;
    kind: "route" | "motion";
    points: Array<{ x: number; y: number }>;
  }>;
};
```

Rules:

- coordinates are finite numbers clamped to `0..100`
- player IDs are unique within a play
- paths reference an existing player
- a saved path contains at least two points
- route paths render solid with a directional arrow
- motion paths render dashed with a directional arrow

## Field presentation

The field is an abstract coaching surface, not a photorealistic football field.

- line of scrimmage is visually clear
- yard guides are quiet
- player markers must remain readable over routes
- no decorative field textures
- use existing fld.LAB colors and typography

## Persistence plan

The first editor prototype may use team-keyed browser storage so field interaction can be validated without a production schema change.

After editor behavior is approved, persistence moves to D1 with a `plays` table and authenticated team-scoped API. Browser storage is then removed as the source of truth.

Planned fields:

- `id`
- `team_id`
- `name`
- `side` (`offense` or `defense`)
- `formation`
- `notes`
- `diagram_json`
- `archived`
- `created_at`
- `updated_at`

## Responsive behavior

### Tablet / desktop

- library can use a multi-column play grid
- editor uses a field-first two-column layout with controls alongside the field

### Phone

- editor becomes a single-column full-width field
- primary drawing controls stay within thumb reach
- metadata may collapse below the field
- the field must remain large enough to drag players accurately

## Product boundary

Playbook is a coaching reference tool inside fld.LAB. It should stay fast and visual. It must not expand into league administration, game scheduling, parent communication, or a general team-management suite.

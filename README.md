# fld.LAB

**fld.LAB** is a tablet-first web app for coaches to run athlete testing and training sessions, capture results quickly on the field, and track performance over time.

## Product goal

Make field testing fast enough that one coach can operate the app from an iPad or phone without slowing down practice.

The app is intentionally narrow:

- manage a team roster
- run drills and tests
- switch between athletes quickly
- capture timed splits, attempts, scores, distances, counts, ratings, and notes
- review athlete and team progress over time
- add new drill types through importable drill-definition files instead of custom application code

## Core product areas

### Home
A lightweight launch screen for starting or resuming training. Home is for action, not analysis.

### Roster
A compact roster table with fast athlete lookup, add/edit controls, and access to each athlete's performance history.

### Train
The primary field-use experience. Select a drill, select an athlete, capture the result, save, and move immediately to the next athlete.

### Data
Athlete history, personal bests, trends, drill leaderboards, team averages, and comparisons.

### Supporting areas
- **Drills** — drill library and import management
- **Settings** — team and application preferences

## Design principles

1. **Field speed first.** Common actions should take one tap whenever possible.
2. **Roster and Data are dense; Train is large.** Browsing screens should be compact. Active testing controls should be large and easy to hit outdoors.
3. **No oversized cards.** Prefer tables, rows, sheets, and compact lists.
4. **Drills are data.** New drills should be defined by importable JSON files and rendered by a reusable drill runner.
5. **Historical data is durable.** Editing an athlete or updating a drill definition must not rewrite prior results.
6. **Tablet first, phone capable.** Optimize for iPad landscape while keeping all workflows usable on a phone.
7. **Keep the scope narrow.** fld.LAB is a training and performance tracker, not a full youth-sports administration platform.

## Working visual direction

- Brand: `fld.LAB`
- Primary color: purple
- Secondary: deep midnight/navy
- Dark UI direction
- Clean sports-performance feel
- Simple geometric typography
- Lucide-style line icons

## Proposed stack

- React + TypeScript
- Vite
- Cloudflare Workers + Static Assets
- Cloudflare D1
- Tailwind CSS
- shadcn/ui
- Lucide icons
- Recharts

Cloudflare's current React + Vite tooling supports a React SPA with a Worker API using the Cloudflare Vite plugin, and D1 provides the serverless SQL data layer.

## Documentation

- [`docs/PRODUCT.md`](docs/PRODUCT.md) — product scope and UX requirements
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — proposed entities and relationships
- [`docs/DRILL_SPEC.md`](docs/DRILL_SPEC.md) — configurable drill/import format
- [`docs/TECHNICAL.md`](docs/TECHNICAL.md) — architecture and implementation guardrails

## Current status

Planning / foundation. No production application code has been established yet.

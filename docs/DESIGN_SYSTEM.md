# fld.LAB — Design System

This document defines the default visual and component rules for fld.LAB. Coding agents should follow these rules unless a later product decision explicitly replaces them.

## 1. Design intent

fld.LAB should feel like a focused sports-performance tool, not a youth-team management portal.

Core principles:

- dark, restrained interface
- purple accent
- dense information outside active training
- large touch controls only where field use requires them
- minimal decoration
- familiar interface patterns
- consistent icons and components
- no custom visual treatment unless it improves field usability

Primary rule:

> Roster and Data are dense. Train is big.

## 2. Brand direction

Working name: **fld.LAB**

Working palette:

```text
brand-purple   #7C3AED
brand-midnight #0F172A
```

Use semantic tokens rather than raw colors throughout components:

```text
--background
--surface
--surface-elevated
--border
--text-primary
--text-secondary
--text-muted
--accent
--accent-hover
--accent-foreground
--success
--warning
--danger
```

Rules:

- Purple is the primary interactive/accent color.
- Midnight/navy is the dark foundation.
- Green may indicate successful saves or improvement.
- Red is reserved for destructive actions and errors.
- Do not use color as the only indicator of state.
- No gradients by default.
- Avoid decorative multi-color charts.

The current logo treatment is provisional. Do not hard-code layout assumptions that depend on final logo artwork.

## 3. Typography

Use a system-first sans-serif stack initially:

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
  "Segoe UI", sans-serif;
```

If Inter is not already present, system UI is acceptable. Do not add a custom font dependency just for branding.

Use tabular numerals for timers and performance values when available.

Avoid oversized dashboard headings.

## 4. Icon system

Use **Lucide** for application icons.

Rules:

- one icon library only
- no emoji as control icons
- prefer outline icons
- normal icon sizes: 16, 18, 20, or 24 px
- icons normally inherit text color
- icon-only controls require accessible labels
- use text labels when icon meaning could be ambiguous

Suggested navigation mapping:

```text
Home       → House
Roster     → Users
Train      → Timer
Data       → ChartNoAxesColumnIncreasing
Drills     → Library
Settings   → Settings
```

Use the closest current Lucide equivalent if a component name changes.

## 5. Drill icon registry

A drill definition may include an optional `icon` string. The app maps that string to an approved Lucide icon.

The drill JSON must never contain raw SVG or executable icon code.

Approved MVP keys:

```text
timer           → Timer
sprint          → Gauge
speed           → Gauge
agility         → Move
shuttle         → ArrowLeftRight
route           → Route
catch           → Hand
accuracy        → Crosshair
throw           → Send
flag            → Flag
pursuit         → Navigation
jump            → ArrowUp
power           → Zap
reps            → Repeat2
count           → Hash
rating          → Star
cone            → Triangle
stopwatch       → TimerReset
```

Example:

```json
{
  "schema_version": 1,
  "slug": "20-yard-sprint",
  "name": "20-Yard Sprint",
  "category": "Speed",
  "icon": "sprint",
  "measurement": {
    "type": "time",
    "unit": "ms",
    "direction": "lower"
  },
  "attempts": {
    "count": 2,
    "result": "best"
  },
  "timer": {
    "enabled": true,
    "splits": []
  }
}
```

**The canonical timed measurement type is `time`, not `timed`.** `DRILL_SPEC.md` and `schemas/drill-definition.schema.json` are authoritative for drill behavior.

Fallback behavior:

- unknown icon → generic `Activity`
- missing icon → category icon if available, otherwise `Activity`
- icon problems never cause an otherwise valid drill import to fail

Add new production icon keys to this registry before using them in drill files.

## 6. Custom assets

Expected MVP custom assets:

- fld.LAB wordmark
- compact fld.LAB mark/app icon
- favicon/PWA variants

Suggested structure:

```text
public/
└── brand/
    ├── wordmark-light.svg
    ├── wordmark-dark.svg
    ├── mark.svg
    ├── favicon.svg
    ├── pwa-192.png
    └── pwa-512.png
```

Do not make custom SVGs for ordinary controls, statuses, drill icons, navigation, or charts when Lucide already provides an acceptable icon.

## 7. Component foundation

Use **shadcn/ui** primitives where appropriate.

Preferred stock components:

- Button
- Input
- Select
- Dialog
- Sheet / Drawer
- Dropdown Menu
- Tabs
- Table
- Badge
- Tooltip
- Alert Dialog
- Separator

Do not create a parallel button/input/modal system.

## 8. Buttons

Keep variants limited:

- **Primary** — purple main action
- **Secondary** — neutral/surface action
- **Destructive** — archive/delete/irreversible action
- **Ghost** — low-priority row/menu action

Normal browsing controls should stay compact.

Train controls can be intentionally larger, especially Start, Stop, Split, and Save + Next, but should use the same visual language.

Avoid multiple competing primary actions on one screen.

## 9. Rows, tables, and panels

Cards are not the default container.

Prefer:

- tables
- compact rows
- separators
- flat grouped panels

Avoid:

- tall athlete cards
- large dashboard tiles for simple values
- nested rounded containers

Roster target row height:

```text
44–52 px
```

Tablet/desktop tables:

- left-align names/text
- right-align numeric performance values where practical
- use tabular numerals
- whole athlete row may be clickable
- use one small overflow menu for row actions

Phone layouts should collapse structured data into dense rows rather than horizontal tables.

## 10. Train interface

Train is the exception to the dense-interface rule.

During active capture:

- active athlete name is prominent
- timer/result is very large
- Start/Stop is the dominant control
- Split only appears when the drill defines it
- athlete switching stays immediately available
- Save + Next is obvious after capture
- secondary navigation visually recedes

Do not make a coach aim for small controls while timing an athlete.

Follow the interaction states in `UX_FLOWS.md`.

## 11. Charts

Use **Recharts**.

Initial chart pattern: simple line trend over time.

Rules:

- accent purple for primary series
- muted neutrals for references/secondary series
- green/red only where improvement/regression meaning is explicit
- no 3D effects
- no decorative gradients
- no rainbow category palettes by default
- exact date/value in tooltip
- show the underlying result history nearby when practical

Leaderboards should normally be lists/tables, not bar charts.

## 12. Responsive behavior

### iPad landscape — primary

- persistent left navigation
- compact header
- dense rows/tables
- two-column layouts only where useful
- large Train interaction area

### iPad portrait

- preserve navigation if practical
- stack secondary content before shrinking critical controls

### Phone

- compact/bottom navigation is acceptable
- roster stays around 44–52 px per row
- hide lower-priority metadata
- no horizontal roster scrolling
- Train retains large controls

## 13. Status and feedback

Use restrained feedback:

- saved → subtle success treatment
- personal best → restrained highlight
- saving/retrying → inline status
- failed save → visible error + retry
- archived/inactive → muted treatment

Avoid unnecessary success dialogs or toast spam during practice.

## 14. Motion

Motion is functional only.

Acceptable:

- quick hover/focus transitions
- sheet/dialog transitions
- subtle state changes

Avoid:

- decorative page transitions
- bouncing/pulsing controls
- chart animations that delay reading
- anything that delays Start, Stop, Save, or athlete switching

## 15. Accessibility and touch

- Maintain readable contrast on dark surfaces.
- Visible focus states are required.
- Do not rely on color alone.
- Critical field actions should exceed minimum touch-target sizing.
- Icon-only buttons require accessible labels.
- Keyboard behavior should remain usable even though touch is primary.

## 16. Asset decision rule

Before adding an asset:

1. Can this be expressed with text?
2. Is there an appropriate Lucide icon?
3. Can an existing token/component solve it?
4. Only then create a custom asset.

## 17. Coding-agent guardrails

Do not:

- invent feature-specific colors
- introduce another icon library
- add emoji icons
- use custom SVGs for standard actions
- turn every section into a card
- use giant athlete cards
- create per-page button styles
- create one-off drill artwork
- use gradients by default
- redesign the brand while implementing a feature
- invent a new drill measurement type outside the documented schema

When uncertain, choose the simpler, denser, more familiar interface.
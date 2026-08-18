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

Primary design rule:

> Roster and Data are dense. Train is big.

## 2. Brand direction

Working name: **fld.LAB**

Working visual direction:
- primary accent: purple
- secondary/background: deep midnight navy
- neutral text: white / cool gray
- sports-performance aesthetic
- clean geometric typography
- no football clip art, mascots, gradients, or decorative illustrations by default

The current logo treatment is provisional. Do not hard-code layout assumptions that depend on the final logo artwork.

## 3. Color tokens

Use semantic design tokens. Do not scatter raw hex values through components.

Initial working palette:

```text
brand-purple        #7C3AED
brand-midnight      #0F172A
```

Recommended semantic tokens:

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

Implementation should map these tokens to actual values in one theme location.

Guidelines:
- Purple is the primary interactive/accent color.
- Midnight/navy is the primary dark foundation.
- Use neutral surface steps rather than many unrelated dark colors.
- Green may indicate positive/successful results, personal bests, or successful saves.
- Red is reserved for destructive actions, failed saves, and errors.
- Do not use color as the only indicator of state.
- Avoid decorative multi-color charts.

## 4. Typography

Use a system/web-safe sans-serif stack initially.

Preferred starting stack:

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
  "Segoe UI", sans-serif;
```

If Inter is not already available, system UI is acceptable. Do not add a custom font dependency merely for branding.

Hierarchy:
- page title: strong but compact
- section title: medium emphasis
- body/table text: highly readable
- metadata: smaller and muted
- timer/result numbers: tabular numerals when available

Avoid oversized dashboard headings.

## 5. Icon system

### Default library

Use **Lucide** for application icons.

Rules:
- Do not mix icon libraries.
- Do not use emoji as UI icons.
- Prefer outline icons.
- Use consistent stroke weight.
- Default sizes should generally be 16, 18, 20, or 24 px.
- Icons should normally inherit text color.
- An icon should support a label, not replace clear wording when ambiguity is possible.

### Primary navigation icons

Recommended Lucide mapping:

```text
Home       → House
Roster     → Users
Train      → Timer / Activity
Data       → ChartNoAxesColumnIncreasing
Drills     → Library / Dumbbell / Goal
Settings   → Settings
```

Exact Lucide component names may change with the library version. Choose the closest current equivalent while preserving the meaning.

## 6. Drill icon registry

Drill definitions may specify an icon key. The app maps that key to an approved Lucide icon.

The JSON file should never contain raw SVG or executable icon code.

Initial approved registry:

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

Example drill definition:

```json
{
  "name": "20-Yard Sprint",
  "icon": "sprint",
  "measurement": {
    "type": "timed"
  }
}
```

Fallback behavior:
- Unknown icon key → use a generic `Activity` icon.
- Missing icon → use the category icon if available.
- Do not fail drill import because of a missing decorative icon.

Add new icon keys to this registry before using them in production drill files.

## 7. Custom assets

Custom assets should be rare.

Expected MVP custom assets:
- fld.LAB wordmark
- compact fld.LAB mark/app icon
- favicon / PWA icon variants

Do not create custom SVGs for ordinary controls, drills, tables, charts, navigation, or statuses when Lucide already provides an acceptable symbol.

Suggested asset structure:

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

If the final wordmark is rendered as text rather than SVG, keep the mark/icon assets under the same folder.

## 8. Component foundation

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

Do not create a parallel custom button/input/modal system.

## 9. Buttons

Keep button variants limited.

Recommended variants:
- **Primary** — main action; purple
- **Secondary** — neutral/surface action
- **Destructive** — archive/delete/irreversible action
- **Ghost** — low-priority row/menu action

Sizing:
- normal browsing controls: compact standard sizing
- field training controls: intentionally larger touch targets
- Start/Stop may be oversized, but should still use the same visual language

Avoid multiple competing primary buttons on one screen.

## 10. Cards, panels, and rows

Cards are not the default information container.

Prefer:
- tables
- compact rows
- separators
- flat grouped panels

Avoid:
- tall athlete cards
- large dashboard tiles for simple values
- excessive rounded containers inside rounded containers

Roster target row height:
- approximately **44–52 px**

Recent-result and drill-library rows should follow a similar compact rhythm.

## 11. Tables

Tables are preferred on tablet/desktop for structured data.

Guidelines:
- compact row height
- subtle borders/dividers
- left-align names/text
- right-align numeric performance values when practical
- use tabular numerals
- whole athlete row may be clickable
- use a small overflow/action menu instead of several visible action buttons

Phone layouts should collapse table data into dense rows rather than forcing horizontal scrolling.

## 12. Training controls

Train is the exception to the dense interface rule.

When timing or actively capturing a result:
- active athlete name is prominent
- timer/result is very large
- Start/Stop is the dominant touch target
- Split appears only when supported by the drill
- athlete switching stays immediately available
- Save + Next is highly visible after capture
- secondary navigation and metadata may visually recede

Do not make the user aim for small controls while running a drill.

## 13. Charts

Use **Recharts**.

Charts should answer a specific question, usually change over time.

Rules:
- simple line charts are preferred
- use the accent purple for primary series
- use muted neutrals for secondary/reference series
- green/red may indicate improvement/regression only when the meaning is explicit
- do not use gradients, 3D effects, decorative area fills, or rainbow category palettes by default
- always expose the underlying result/history list nearby when practical
- tooltips should show exact values and dates

Leaderboards should usually be lists/tables, not bar charts.

## 14. Spacing and density

Use a consistent spacing scale from the chosen component/Tailwind system.

General behavior:
- compact navigation
- compact roster and data screens
- moderate panel padding
- avoid excessive vertical whitespace
- increase spacing only around active field controls

A coach should be able to see a meaningful amount of roster/session information on an iPad without scrolling through oversized UI.

## 15. Responsive behavior

### iPad landscape — primary target
- persistent left navigation
- compact header
- dense rows/tables
- two-column layouts only where useful
- large active Train controls

### iPad portrait
- preserve navigation if practical
- stack secondary content before shrinking critical controls

### Phone
- collapse primary navigation to an appropriate compact pattern
- preserve 44–52 px dense roster rows
- hide lower-priority metadata
- never require horizontal scrolling for the roster
- Train retains large touch controls

## 16. Status and feedback

Use familiar visual feedback:
- saved → subtle success treatment
- personal best → clear but restrained highlight
- saving/retrying → small inline status
- failed save → visible error plus retry action
- archived/inactive → muted treatment

Do not interrupt field workflow with unnecessary success modals or toast spam.

## 17. Motion

Motion should be minimal and functional.

Acceptable:
- quick hover/focus transitions
- sheet/dialog transitions
- subtle state changes

Avoid:
- decorative page transitions
- animated charts on every load
- bouncing/pulsing controls
- motion that delays Start, Stop, Save, or athlete switching

## 18. Accessibility and touch

- Maintain readable contrast on dark surfaces.
- Visible focus states are required.
- Do not rely only on color for meaning.
- Standard touch targets should be comfortably tappable.
- Critical field actions should be larger than minimum touch targets.
- Icon-only buttons require accessible labels/tooltips where appropriate.

## 19. Asset decision rule

Before adding a new asset, ask in this order:

1. Can this be expressed with text?
2. Is there an appropriate Lucide icon?
3. Can an existing design token/component solve it?
4. Only then create a custom asset.

This keeps the product visually consistent and reduces maintenance.

## 20. Coding-agent guardrails

Do not:
- invent new colors per feature
- introduce another icon library
- add emoji icons
- use custom SVGs for standard actions
- turn every section into a card
- use giant mobile cards for athletes
- create per-page button styles
- create one-off drill artwork
- use gradients as a default visual treatment
- redesign the brand during implementation

When uncertain, choose the simpler, denser, more familiar interface.

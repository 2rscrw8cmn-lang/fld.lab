# fld.LAB — Cloudflare + D1 Runbook

This document is the operational source of truth for creating, configuring, migrating, deploying, and recovering fld.LAB on Cloudflare.

Product and data behavior remain defined in `PRODUCT.md`, `DATA_MODEL.md`, `DRILL_SPEC.md`, and `TECHNICAL.md`.

## 1. Platform decision

Use one Cloudflare deployment unit:

```text
React + TypeScript + Vite
        │
Cloudflare Static Assets
        │
Cloudflare Worker API
        │
Cloudflare D1
```

Primary services:

- Cloudflare Workers
- Cloudflare Static Assets
- Cloudflare D1
- Wrangler
- Cloudflare Vite plugin

Optional later:

- R2 for files/exports if required
- a dedicated auth provider or Cloudflare-based access solution when the production access model is implemented

Do not split frontend and API across hosting platforms without a concrete need.

## 2. Naming conventions

Worker:

```text
fld-lab
```

Production D1 database:

```text
fld-lab-prod
```

D1 binding:

```text
DB
```

Worker access:

```ts
env.DB
```

Database IDs belong in Wrangler configuration, never application code.

## 3. Scaffold

Prefer the current Cloudflare React + Vite scaffold:

```bash
npm create cloudflare@latest -- fld-lab --framework=react
```

Because this repository already contains planning documents and history, scaffold **into the existing repository without replacing the repo or docs**.

Expected shape:

```text
/
├── docs/
├── migrations/
├── public/
├── schemas/
├── scripts/
├── src/
├── worker/
├── vite.config.ts
├── wrangler.jsonc
└── package.json
```

Generated structure may vary with Cloudflare tooling. Preserve the architecture, not an obsolete exact folder layout.

## 4. Wrangler configuration

Keep `wrangler.jsonc` in the repository.

Representative shape:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "fld-lab",
  "main": "worker/index.ts",
  "compatibility_date": "YYYY-MM-DD",
  "assets": {
    "not_found_handling": "single-page-application"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "fld-lab-prod",
      "database_id": "<D1_DATABASE_ID>",
      "migrations_dir": "migrations"
    }
  ]
}
```

Rules:

- use the compatibility date expected by the current scaffold
- point `main` at the actual Worker entry
- keep SPA route fallback enabled
- never commit a placeholder as if it were a real database ID
- generated Wrangler structure may differ; preserve the `DB` binding and migration rules

## 5. Production database creation

Create once:

```bash
npx wrangler d1 create fld-lab-prod
```

Copy the returned database ID into the `DB` binding in `wrangler.jsonc`.

Do not create a new production database per deployment.

## 6. Local development

Normal feature development uses local D1 emulation, not production data.

Apply migrations locally:

```bash
npx wrangler d1 migrations apply fld-lab-prod --local
```

Start the app with the repository's actual development script, expected to be:

```bash
npm run dev
```

Local D1 state must not be committed.

If custom persistence is needed:

```bash
npx wrangler dev --persist-to=.wrangler/local-state
```

## 7. Migrations

Every schema change is a migration.

Create:

```bash
npx wrangler d1 migrations create fld-lab-prod <migration-name>
```

Apply locally first:

```bash
npx wrangler d1 migrations apply fld-lab-prod --local
```

Review production state:

```bash
npx wrangler d1 migrations list fld-lab-prod --remote
```

Apply deliberately to production:

```bash
npx wrangler d1 migrations apply fld-lab-prod --remote
```

Do not use manual dashboard schema edits as the normal development workflow.

Migration names should describe intent:

```text
0001_initial_roster.sql
0002_add_drills.sql
0003_add_training_sessions.sql
```

Avoid names such as `fix.sql` or `changes.sql`.

## 8. Migration sequence

### Phase 1

Create only:

```text
teams
athletes
team_memberships
```

For MVP:

- `Team` is season-specific
- athlete identity is stored on `athletes`
- jersey number and positions are stored on `team_memberships`

### Phase 2+

Add as needed:

```text
drills
drill_versions
training_sessions
session_athletes
attempts
measurements
```

**There is no separate `splits` table in the MVP model.** Timed splits are `measurements` with keys such as `split_10yd`.

Do not create speculative tables for messaging, parents, attendance, payments, medical records, or other post-MVP systems.

## 9. Index guidance

Add indexes alongside the queries that justify them.

Likely starting indexes:

```text
team_memberships(team_id, active)
team_memberships(athlete_id)
training_sessions(team_id, started_at)
training_sessions(drill_id, started_at)
session_athletes(session_id, order_index)
attempts(session_id, athlete_id)
attempts(athlete_id, created_at)
measurements(attempt_id, key)
```

Do not index every column by default.

## 10. D1 data rules

Mandatory rules:

- use stable generated IDs
- never key athletes by name or jersey number
- never key drills by display name
- use the documented stable drill `slug`
- store elapsed times as integer milliseconds
- use consistent timestamps
- archive historical entities rather than casually deleting them
- keep used `DrillVersion` rows immutable
- preserve the exact drill version referenced by each session
- never silently cascade-delete performance history
- timed splits are measurements, not a second storage system

See `DATA_MODEL.md` for entity ownership and relationships.

## 11. Seed data

Development seed data is encouraged.

Suggested local seed:

- one fictional U10 team
- 8–12 fictional athletes
- team membership jersey numbers/positions
- several starter drills
- sample results when chart work begins

Keep seed data separate from schema migrations when practical:

```text
scripts/
└── seed.local.sql
```

Run locally:

```bash
npx wrangler d1 execute fld-lab-prod --local --file=./scripts/seed.local.sql
```

Never seed production with fake athletes by default.

## 12. Local vs remote rule

Use `--local` for normal development.

Use `--remote` only when intentionally operating on Cloudflare-hosted production D1.

Examples:

```bash
npx wrangler d1 execute fld-lab-prod --local --command "SELECT * FROM athletes;"
```

```bash
npx wrangler d1 execute fld-lab-prod --remote --command "SELECT COUNT(*) FROM athletes;"
```

Treat every `--remote` write/destructive command as a production operation.

## 13. Preview environment

MVP does not require a preview database.

Initial model:

```text
Local development → local D1
Production        → fld-lab-prod
```

If automated previews or multiple developers later justify it, add an explicitly isolated database such as:

```text
fld-lab-preview
```

Never point preview builds at production D1 by convenience.

## 14. Secrets and environment variables

D1 bindings are configuration, not secrets.

Local Worker secrets, if/when needed:

```text
.dev.vars
```

Ignore:

```gitignore
.dev.vars*
.env*
.wrangler/
```

Production secrets:

```bash
npx wrangler secret put SECRET_NAME
```

Do not invent secrets until an actual feature requires them.

## 15. Worker types

Use the `DB` binding through typed Worker environment bindings.

Conceptually:

```ts
export interface Env {
  DB: D1Database
}
```

Prefer Wrangler-generated binding types where supported.

Do not bypass binding errors with `any`.

## 16. API boundary

Browser code communicates with the Worker through `/api/*`.

```text
Browser
  ↓ /api/*
Worker
  ↓ env.DB
D1
```

Browser code must never receive:

- Cloudflare API credentials
- D1 administrative credentials
- direct database-management access

The request/response contract is defined in `API_CONTRACT.md`.

## 17. Stopwatch/network rule

Cloudflare is **not** in the timing path.

For a timed attempt:

1. Start/split/stop occur entirely in browser state.
2. The browser calculates elapsed values using a monotonic clock.
3. Completed result enters local app state.
4. `Save + Next` may advance immediately.
5. The Worker persists the completed attempt to D1.
6. A failed write stays visibly retryable.

Never discard a completed result because the network or D1 is temporarily unavailable.

## 18. Production access requirement

Local development may operate without authentication while the core workflow is being built.

**Do not load real youth-athlete names/results into an internet-accessible production deployment until access control is implemented and verified.**

Before real production use:

- unauthenticated public API access must be removed
- team data must only be available to authorized users
- write endpoints must be protected
- production URLs must not expose athlete data anonymously

See `SECURITY.md`.

## 19. Deployment workflow

Phase 1 should establish repeatable commands that actually exist in `package.json`.

Expected sequence:

```bash
npm install
npm run typecheck
npm test
npm run build
npx wrangler d1 migrations list fld-lab-prod --remote
npx wrangler d1 migrations apply fld-lab-prod --remote
npx wrangler deploy
```

If a referenced script does not exist yet, add it during scaffolding rather than leaving documentation that points to fake commands.

A deployment must never depend on manual database edits in the Cloudflare dashboard.

## 20. Export and recovery

Production export:

```bash
npx wrangler d1 export fld-lab-prod --remote --output=./backups/fld-lab-prod.sql
```

Local export:

```bash
npx wrangler d1 export fld-lab-prod --local --output=./backups/fld-lab-local.sql
```

Never commit production exports containing athlete data to this public repository.

D1 Time Travel is the first-line point-in-time recovery mechanism within the retention available to the account.

Recovery procedure:

1. stop additional writes if practical
2. identify the bad operation/migration time
3. identify the appropriate recovery point
4. restore deliberately
5. verify roster and result integrity
6. fix the triggering code/migration before redeployment

## 21. Production privacy

Do not commit:

- real athlete exports
- production database dumps
- access/API tokens
- `.dev.vars`
- real production seed data
- unsanitized screenshots containing athlete information

Keep youth-athlete PII limited to the fields defined in `DATA_MODEL.md`.

## 22. Phase 1 checklist

- [ ] React/Vite/Worker scaffold runs locally
- [ ] `wrangler.jsonc` exists
- [ ] Worker is named `fld-lab`
- [ ] production D1 database exists
- [ ] D1 binding is `DB`
- [ ] real database ID is configured
- [ ] `migrations/` exists
- [ ] initial roster migration applies locally
- [ ] initial roster migration applies remotely
- [ ] local app reads/writes local D1
- [ ] deployed Worker can read/write configured D1
- [ ] local state and secrets are gitignored
- [ ] type checking passes
- [ ] build succeeds
- [ ] no real youth-athlete data is exposed anonymously

## 23. Command reference

```bash
# create database
npx wrangler d1 create fld-lab-prod

# create migration
npx wrangler d1 migrations create fld-lab-prod <migration-name>

# list migrations
npx wrangler d1 migrations list fld-lab-prod --local
npx wrangler d1 migrations list fld-lab-prod --remote

# apply migrations
npx wrangler d1 migrations apply fld-lab-prod --local
npx wrangler d1 migrations apply fld-lab-prod --remote

# execute SQL
npx wrangler d1 execute fld-lab-prod --local --command "SELECT 1;"
npx wrangler d1 execute fld-lab-prod --remote --command "SELECT 1;"

# export production
npx wrangler d1 export fld-lab-prod --remote --output=./fld-lab-prod.sql

# set secret
npx wrangler secret put SECRET_NAME

# deploy
npx wrangler deploy
```

## 24. Guardrails

- one production D1 database is enough for MVP
- do not use production D1 for normal local development
- do not hard-code database IDs in TypeScript
- do not introduce an ORM unless it clearly reduces complexity
- do not manually patch production schema as the normal workflow
- do not expose D1 administration to browser code
- do not store production exports in the public repo
- do not let database writes block athlete switching or stopwatch timing
- do not create preview infrastructure before it is useful
- do not create a separate splits table
- keep Cloudflare setup reproducible from the repository
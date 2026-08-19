# fld.LAB — Security + Privacy Guardrails

fld.LAB stores youth-athlete names and performance results. Keep the product simple, but treat both authentication and team authorization as mandatory production boundaries.

## 1. Development vs production

Local/mock development may use the explicit localhost-only development identity and fictional seed data.

An internet-accessible deployment may be used for shell/testing work **only with fictional or sanitized data** until the production access gate is verified.

Before entering real athlete names/results into production:

- Cloudflare Access must protect the deployed application
- Worker JWT verification must be enabled
- team data must require an active Coach → Team permission
- write endpoints must require authorized access
- anonymous requests must not return roster/results
- authorization must be enforced by the Worker, not only hidden in the UI

## 2. Data minimization

Expected:

- coach email used for identity/authorization
- athlete first/last name
- optional birth year
- team membership
- jersey number
- positions
- optional coach notes
- training results

Do not add without a concrete approved requirement:

- coach passwords or OTPs
- full athlete date of birth
- home address
- parent contact information
- school information
- medical information
- payment information

## 3. Public repository rule

This repository is public.

Never commit:

- real production database exports
- real athlete CSV/JSON exports
- production tokens or secrets
- `.dev.vars`
- Cloudflare API tokens
- Access JWTs
- real production seed files
- real production coach allowlist values
- unsanitized screenshots showing athlete information

Use fictional names/emails for fixtures, examples, and screenshots.

## 4. Authentication boundary

Cloudflare Access is the identity provider and first gate.

The Worker independently verifies the `Cf-Access-Jwt-Assertion` signature and claims and checks the verified email against the deployment's `AUTHORIZED_COACH_EMAILS` value.

The deployment allowlist means:

> this identity is eligible to use fld.LAB

It does **not** mean:

> this identity may access every team in D1

Never trust a client-supplied email, local storage value, hidden route, or unverified header as identity.

## 5. Team authorization boundary

D1 `coaches` and `team_coaches` records provide the second gate.

Roles:

- `owner` — team use + team edit/archive + coach access management
- `coach` — team use, roster, Train, Data, and history; no team edit/archive/sharing

Every team-scoped Worker route must verify an active `team_coaches` membership before reading or mutating data.

Derived-resource rules:

- roster → authorize the team
- TeamMembership mutation → resolve the membership's team, then authorize
- athlete results → require an explicit accessible `team_id` and athlete membership in that team
- session/attempt/session-athlete routes → resolve the session's team, then authorize
- leaderboard/team trend/team session history → authorize the requested team
- team edit/archive/coach sharing → require owner

Never rely on:

- a hidden route
- a disabled button
- a client-supplied team ID by itself
- a session/athlete/membership ID by itself
- browser local storage as proof of authorization

For inaccessible team-scoped resources, prefer `404` so IDs cannot be used to enumerate another coach's data. Use `403` for an accessible team when the signed-in coach lacks the owner role required for a management action.

## 6. Legacy-team bootstrap

Migration `0004_coach_team_access.sql` creates the authorization tables but intentionally does not contain account-specific emails.

At runtime, after the migration is deployed, the Worker performs a one-time compatibility bootstrap for any Team that has **no** TeamCoach rows:

- create minimal Coach records for the currently configured authorized coach emails
- add each of those coaches to the legacy Team as `owner`

This preserves teams that were intentionally shared before per-team ownership existed.

Important:

- the bootstrap applies only to teams with zero TeamCoach rows
- newly created teams are owned only by their creator
- adding another email to the deployment allowlist later does not silently grant that person existing teams
- team sharing after bootstrap must be explicit in Settings

## 7. Team sharing

Owners may add a coach by email from Settings only when that email is already allowed by the production Access policy/Worker allowlist.

The team-sharing endpoint does not and cannot modify Cloudflare Access policy configuration. Operational order for a brand-new coach is:

1. approve the email in the fld.LAB Cloudflare Access policy
2. add the email to the Worker `AUTHORIZED_COACH_EMAILS` deployment value
3. deploy the Worker variable change
4. an owner grants that email access to the intended Team in Settings

Do not add an invitation flow that pretends to bypass these deployment-level controls.

Owners may remove another coach's team access. Removal is soft; roster/session/result history is not deleted. A team must retain at least one owner. Self-removal/owner transfer is intentionally deferred.

## 8. Database access

D1 is accessed only through Worker bindings.

Browser code must never receive:

- D1 management credentials
- Cloudflare administrative credentials
- database IDs/tokens that permit direct administration

Normal path:

```text
Browser
  → Cloudflare Access
  → Worker JWT allowlist verification
  → Coach / TeamCoach authorization
  → Worker /api/*
  → env.DB
  → D1
```

If the team-permission schema is missing or unavailable after code requiring it is deployed, protected application routes fail closed rather than falling back to shared access.

## 9. Secrets

Local Worker values belong in `.dev.vars` when needed.

Production secrets and account-specific deployment values are managed through Cloudflare/Wrangler configuration mechanisms.

Never hard-code secrets or production identities in TypeScript, SQL migrations, JSON, test fixtures, or documentation examples.

The Access issuer, AUD, and authorized coach email allowlist are deployment-specific configuration and must not be committed with real account values in this public repository.

## 10. Logging

Do not log full sensitive payloads by default.

Avoid production logs containing:

- full roster dumps
- coach notes
- raw exports
- auth tokens/session credentials
- Access JWT claims beyond minimal operational need

Useful operational logging should prefer IDs, route/state, error category, and request correlation information.

Authentication failures must never log the raw Access JWT.

## 11. Error handling

Client-facing errors must not expose:

- SQL statements/errors
- stack traces
- secret values
- Cloudflare account metadata
- another coach's resource existence
- internal authorization queries

Use the structured errors in `API_CONTRACT.md`.

Authentication/authorization responses use generic 401/403/404/503 messages and do not echo tokens or sensitive claims.

## 12. Data deletion and history

Normal removal is archival/deactivation, not destructive deletion.

- TeamCoach access → deactivate
- athlete with history → mark inactive
- TeamMembership → mark inactive/end membership
- drill with history → archive
- team with history → archive
- completed session → delete only as an explicit corrective action

Do not add casual cascade deletes that can erase training history.

If a future requirement calls for permanent deletion/export of personal data, implement it deliberately and document the historical consequences.

## 13. Backups and exports

Production D1 exports contain athlete information and must be treated as protected data.

Do not store production exports in this public repository.

Use D1 recovery mechanisms and protected exports only when operationally necessary.

## 14. Authentication implementation

Current production decision:

- **identity provider:** Cloudflare Access
- **deployment scope:** fld.LAB Worker hostname
- **top-level eligibility:** explicit `AUTHORIZED_COACH_EMAILS` allowlist
- **team authorization:** D1 `Coach` + `TeamCoach`
- **Worker verification:** Access JWT signature, issuer, application audience, expiration/not-before timing, subject, and email
- **sign-in:** Cloudflare Access; One-Time PIN is acceptable for the small trusted-coach deployment
- **sign-out:** `/cdn-cgi/access/logout`
- **local development:** explicit `AUTH_MODE=development`, accepted only on localhost/loopback
- **account recovery:** handled by Cloudflare Access identity method, not fld.LAB password storage

Protected API requests fail closed when production authentication or permission configuration is absent/invalid.

See `AUTH.md` for deployment/runbook steps.

## 15. Production readiness checklist

Before real youth-athlete production data is trusted, verify:

- [ ] Cloudflare Access is enabled on the deployed fld.LAB hostname
- [ ] Access Allow policy is restricted to intended coach accounts
- [ ] production auth variables are configured (`AUTH_MODE`, Access team domain, Access AUD, authorized coach email allowlist)
- [ ] D1 migration `0004_coach_team_access.sql` is applied before deploying code that requires it
- [ ] existing intended shared teams have TeamCoach rows for the expected coaches after bootstrap
- [ ] a newly created team is visible only to its creator until explicitly shared
- [ ] an authenticated coach cannot read another coach's team by guessing/supplying IDs
- [ ] a `coach` role cannot edit/archive/share its team
- [ ] an `owner` can add/remove an approved coach
- [ ] unauthenticated roster/result reads are blocked
- [ ] unauthenticated writes are blocked and do not reach D1 mutation logic
- [ ] a valid token for a non-allowlisted coach is rejected
- [ ] secrets/tokens/production identities are not committed
- [ ] production DB/export files are not committed
- [ ] test/preview deployments do not point at production D1 by default
- [ ] error responses do not leak internal details
- [ ] real-device logout behavior has been tested
- [ ] real-device session-expiration behavior has been tested

Until deployment and authorization checks pass, use fictional/sanitized data only.

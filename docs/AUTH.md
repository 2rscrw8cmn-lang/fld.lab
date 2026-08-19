# fld.LAB — Production Authentication + Team Authorization Runbook

This document is the operational source of truth for fld.LAB production identity and team access.

See also:

- `SECURITY.md` for privacy/security requirements
- `DATA_MODEL.md` for Coach / TeamCoach ownership
- `CLOUDFLARE.md` for Worker/D1 deployment operations

## 1. Current decision

fld.LAB uses **Cloudflare Access** for authentication and a **D1 Coach → TeamCoach authorization layer** for team permissions.

Security is enforced in order:

1. Cloudflare Access protects the deployed application URL.
2. The Worker independently validates the signed Access JWT on every protected `/api/*` request.
3. The verified email must be listed in `AUTHORIZED_COACH_EMAILS`.
4. Team-scoped requests require an active `team_coaches` membership for that Coach.
5. Team-management/sharing mutations require `role = owner`.

The Worker does not trust a client-supplied email, local storage value, hidden route, team ID, athlete ID, membership ID, session ID, or unverified Cloudflare header as authorization.

## 2. Identity vs team access

These are intentionally separate.

`AUTHORIZED_COACH_EMAILS` means an email is eligible to authenticate into fld.LAB. It does **not** grant every Team in D1.

Team access is stored in:

```text
Coach
  └── TeamCoach (owner | coach)
       └── Team
```

Roles:

- `owner` — normal team use plus edit/archive/team-sharing controls
- `coach` — roster, Train, Data, and history for that team; no team edit/archive/sharing

A newly created Team is owned only by the Coach who creates it. An owner may explicitly share it with another already-approved fld.LAB coach from Settings.

## 3. Protected routes

Public:

```text
GET /api/health
```

Protected:

```text
/api/auth/me
all other /api/* routes
```

`/api/auth/me` returns only the minimal verified identity used by the UI:

```json
{
  "coach": {
    "email": "coach@example.com",
    "provider": "cloudflare-access"
  }
}
```

It does not return the deployment allowlist or TeamCoach memberships.

## 4. Production Worker variables

Production requires:

```text
AUTH_MODE=access
ACCESS_TEAM_DOMAIN=https://<team-name>.cloudflareaccess.com
ACCESS_AUD=<Cloudflare Access application audience tag>
AUTHORIZED_COACH_EMAILS=coach1@example.com,coach2@example.com
```

`AUTHORIZED_COACH_EMAILS` is comma-separated. Whitespace/case are normalized by the Worker.

Do not commit account-specific values to this public repository.

If a required production auth value is absent/invalid, protected API routes fail closed instead of becoming anonymous.

## 5. Cloudflare Access policy

In Cloudflare:

1. Open **Workers & Pages** → `fld-lab`.
2. Protect **All traffic** behind Access.
3. Attach the dedicated reusable fld.LAB Allow policy.
4. Keep the policy limited to the coach emails eligible to use fld.LAB.
5. Keep the same eligible emails in `AUTHORIZED_COACH_EMAILS`.

Cloudflare Access admission and the Worker allowlist should agree. Team sharing in fld.LAB never edits the Cloudflare policy itself.

## 6. Authentication method

Cloudflare Access One-Time PIN is acceptable for the current small trusted-coach deployment and avoids fld.LAB storing passwords.

The coach signs in through Cloudflare Access. fld.LAB never receives or stores the PIN.

A future external identity provider may be configured behind Access without changing the team authorization model, provided Access continues issuing the application JWT verified by the Worker.

## 7. Worker JWT verification

Cloudflare Access sends the application token in:

```text
Cf-Access-Jwt-Assertion
```

The Worker:

- requires RS256
- reads the signing key ID (`kid`)
- fetches JWKS from `<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`
- verifies the RSA signature with Web Crypto
- verifies `iss`
- verifies `aud`
- verifies expiration / not-before timing
- requires `sub` and `email`
- compares normalized verified email to `AUTHORIZED_COACH_EMAILS`

JWKS are cached in Worker memory for a bounded period. Access rotates signing keys; fld.LAB never commits a signing key.

## 8. D1 authorization migration

Team permissions require:

```text
migrations/0004_coach_team_access.sql
```

This creates:

- `coaches`
- `team_coaches`
- role/lookup indexes

The migration intentionally contains no real coach emails.

### Deployment order

**Apply migration 0004 before deploying/merging Worker code that requires team permissions.**

From a checkout containing the migration:

```bash
npm run db:migrate:remote
```

The currently deployed pre-ownership Worker safely ignores the new tables. Once ownership code is deployed, it expects the permission schema and fails closed with a generic 503 if the schema is missing.

## 9. Existing-team bootstrap

After migration 0004 and the ownership Worker are live, the first protected application request initializes minimal Coach records and checks for legacy Teams with zero TeamCoach rows.

For each such legacy Team, every email currently in `AUTHORIZED_COACH_EMAILS` receives an active `owner` TeamCoach row.

This is a compatibility bridge for teams that were intentionally shared before per-team authorization existed.

Rules:

- bootstrap only applies when a Team has no TeamCoach rows
- it is idempotent
- new Teams are not broadly shared
- adding a new email to the deployment allowlist later does not grant existing Team access
- ongoing sharing is explicit in Settings

## 10. Adding a brand-new coach

A Team owner cannot grant access to an email that is not already approved at the deployment gate.

Operational order:

1. add the email to the dedicated fld.LAB Cloudflare Access Allow policy
2. add the email to `AUTHORIZED_COACH_EMAILS`
3. deploy/save that Worker configuration
4. sign in or open Settings as an existing owner
5. open the intended Team → **Access**
6. add the coach email

The new membership is role `coach`.

If the coach needs a different Team, grant it separately. Deployment eligibility must never silently imply access to all teams.

## 11. Removing team access

A Team owner may remove another Coach from a Team in Settings.

Removal:

- deactivates the TeamCoach relationship
- does not remove the email from Cloudflare Access or the Worker allowlist
- does not delete roster/session/result history
- prevents that Coach from seeing the Team on future team lists/requests

Current v1 guardrails:

- self-removal is not supported
- the last owner cannot be removed
- owner transfer/promotion workflow is deferred

To remove a coach from fld.LAB entirely, also remove the email from Cloudflare Access policy and `AUTHORIZED_COACH_EMAILS`.

## 12. Local development

Local development is explicit:

```text
AUTH_MODE=development
```

Development bypass is accepted only for localhost/loopback requests. Setting `AUTH_MODE=development` on an internet hostname does not open the API; the Worker fails closed.

The local fictional identity receives/uses TeamCoach records in the local D1 just like a production Coach.

Do not commit `.dev.vars`.

## 13. SPA/session-expiration behavior

Browser API requests send:

```text
X-Requested-With: XMLHttpRequest
```

and same-origin credentials.

This allows an expired Access session to surface as an HTTP authentication failure instead of silently treating a login page as API JSON.

When the API returns 401, fld.LAB shows a session-expired error. Refreshing the application re-enters the Access authentication flow.

## 14. Sign out

Settings exposes **Sign out** for Cloudflare Access sessions.

It navigates to:

```text
/cdn-cgi/access/logout
```

Cloudflare clears/revokes the Access session. Local development does not show this action.

## 15. Required production verification

After introducing TeamCoach authorization, verify both identity and isolation.

### Anonymous read/write

Without a valid Access session:

```text
GET /api/teams
POST /api/teams
```

Expected: blocked by Access / Worker 401 and no D1 application data returned/mutated.

### Non-allowlisted coach

Attempt sign-in with an email not in the Access policy and Worker allowlist.

Expected: no application access; a valid Access JWT that somehow reaches the Worker still receives 403.

### Existing intended shared team

For each coach who was intentionally sharing the team before migration:

- sign in
- confirm the legacy team appears
- confirm Settings shows the expected `Owner` access
- confirm roster/Data/Train still load

### New-team isolation

As Coach A:

1. create a fictional Team
2. confirm Coach A is Owner

As Coach B before sharing:

1. refresh/sign in
2. confirm the new Team is absent
3. directly request the known Team ID/roster/session if testing tools are available
4. expect `404` accessible-scope behavior

Then, as Coach A, share the Team with Coach B. Coach B should see it after refresh with `Coach` role and should not be able to edit/archive/share it.

### Team access removal

Owner removes Coach B from the fictional Team.

Expected after Coach B refresh:

- Team disappears
- direct team-scoped requests return 404
- historical records remain intact for the owner

### Logout/session expiry

Re-run logout and session-expiration checks from the original Access gate verification.

## 16. Production readiness status

The production gate remains complete only when:

- Access is enabled on the deployed hostname
- Allow policy and Worker allowlist contain only intended eligible coaches
- required Worker variables are configured
- migration 0004 is applied
- legacy bootstrap produced only intended shared memberships
- new-team isolation has been tested between two authenticated coaches
- coach-role owner restrictions have been tested
- direct-ID cross-team reads/writes are blocked
- logout/session-expiration behavior works on a real device
- `SECURITY.md` checklist is satisfied

Do not treat successful login alone as proof of correct team authorization.

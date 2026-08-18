# fld.LAB — Production Authentication Runbook

This document is the operational source of truth for the fld.LAB v1 production access gate.

See also:

- `SECURITY.md` for privacy/security requirements
- `CLOUDFLARE.md` for Worker/D1 deployment operations

## 1. v1 authentication decision

fld.LAB v1 uses **Cloudflare Access** in front of the deployed Worker and authorizes **one coach email**.

This matches the current MVP data model: one coach operates multiple teams. Multi-coach roles, team sharing, and organization membership are intentionally deferred until the product requires them.

Security is enforced twice:

1. Cloudflare Access protects the deployed application URL.
2. The Worker independently validates the signed Access JWT on every protected `/api/*` request.

The Worker does not trust a client-supplied email, local storage value, hidden route, or Cloudflare header that has not been cryptographically verified.

## 2. Protected routes

Public:

```text
GET /api/health
```

Protected:

```text
/api/auth/me
all other /api/* routes
```

`/api/auth/me` returns only the minimal identity used by the UI:

```json
{
  "coach": {
    "email": "coach@example.com",
    "provider": "cloudflare-access"
  }
}
```

## 3. Production Worker variables

Production requires all four variables:

```text
AUTH_MODE=access
ACCESS_TEAM_DOMAIN=https://<team-name>.cloudflareaccess.com
ACCESS_AUD=<Cloudflare Access application audience tag>
AUTHORIZED_COACH_EMAIL=<coach email allowed to operate fld.LAB>
```

Do not commit account-specific values to this public repository.

If any required production auth value is absent or invalid, protected API routes fail closed instead of becoming anonymous.

## 4. Enable Cloudflare Access on workers.dev

In Cloudflare:

1. Open **Workers & Pages**.
2. Open the `fld-lab` Worker.
3. Go to **Settings → Domains & Routes**.
4. For the `workers.dev` route, enable **Cloudflare Access**.
5. Open **Manage Cloudflare Access** for the generated application.
6. Configure an **Allow** policy for the same email used in `AUTHORIZED_COACH_EMAIL`.
7. Do not add a broad email-domain or everyone rule for v1.

Cloudflare Access is deny-by-default once the application/policy is configured; only the explicit Allow policy should reach fld.LAB.

## 5. Authentication method

For a one-coach deployment, Cloudflare Access One-Time PIN is acceptable and avoids fld.LAB storing passwords.

The coach signs in through Cloudflare Access. fld.LAB never receives or stores the PIN.

A future external identity provider can replace OTP without changing the domain/data model, provided Access continues issuing the application JWT verified by the Worker.

## 6. Get the Access values

### Team domain

Use the Cloudflare Zero Trust team domain:

```text
https://<team-name>.cloudflareaccess.com
```

Store the full HTTPS origin in `ACCESS_TEAM_DOMAIN` with no path.

### Application Audience (AUD)

In Cloudflare Zero Trust:

1. Go to **Access controls → Applications**.
2. Open the fld.LAB Access application.
3. Open **Additional settings**.
4. Copy the **Application Audience (AUD) Tag**.
5. Store it in `ACCESS_AUD`.

The Worker verifies both issuer and audience, so a valid token issued for another Access application is rejected.

## 7. Worker JWT verification

Cloudflare Access sends the application token in:

```text
Cf-Access-Jwt-Assertion
```

The Worker:

- requires RS256
- reads the signing key ID (`kid`)
- fetches the account JWKS from `<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`
- verifies the RSA signature with Web Crypto
- verifies `iss`
- verifies `aud`
- verifies expiration / not-before timing
- requires `sub` and `email`
- compares the verified email to `AUTHORIZED_COACH_EMAIL`

JWKS are cached in Worker memory for a bounded period. Access rotates signing keys; the application never commits a signing key.

## 8. Local development

Local development remains intentionally unauthenticated, but it must be explicit.

In local `.dev.vars` only:

```text
AUTH_MODE=development
```

Development bypass is accepted only for localhost/loopback requests. Setting `AUTH_MODE=development` on an internet hostname does not open the API; the Worker fails closed.

Do not commit `.dev.vars`.

## 9. SPA/session-expiration behavior

Browser API requests send:

```text
X-Requested-With: XMLHttpRequest
```

and same-origin credentials.

This allows an expired Access session to surface as an HTTP authentication failure instead of silently treating a login page as API JSON.

When the API returns 401, fld.LAB shows a session-expired error. Refreshing the application re-enters the Access authentication flow.

## 10. Sign out

Settings exposes **Sign out** for Cloudflare Access sessions.

It navigates to:

```text
/cdn-cgi/access/logout
```

Cloudflare clears/revokes the Access session. Local development does not show this action.

## 11. Required production verification

Before real youth-athlete data is entered, verify against the deployed Worker.

### Anonymous read

In a private/incognito browser that is not signed into Access:

```text
GET /api/teams
```

Expected: blocked by Access. A direct request reaching the Worker without a valid Access JWT must return 401.

### Anonymous write

Without a valid Access session:

```text
POST /api/teams
```

Expected: blocked/401. The request must not reach D1 mutation logic.

### Wrong coach

Attempt sign-in with an email that is not in the Access Allow policy and not equal to `AUTHORIZED_COACH_EMAIL`.

Expected: no application access. Even if a valid Access JWT from that Access application reached the Worker, the Worker returns 403.

### Valid coach

With the authorized coach account:

- Home loads
- roster loads
- Data loads
- a fictional athlete can be created
- a fictional training result can be saved
- Settings shows the verified coach email

### Logout

From Settings:

1. choose **Sign out**
2. confirm fld.LAB is no longer usable without authenticating again
3. confirm an API request after logout does not return roster/results

### Session expiration

Use a short Access application session during verification.

1. sign in
2. leave fld.LAB open until the Access session expires
3. trigger an API read
4. verify the UI reports the expired session rather than rendering login HTML as data
5. refresh and authenticate again

## 12. Production readiness status

Merging the auth code does **not** by itself approve real athlete data.

The production gate is complete only after:

- Access is enabled on the deployed hostname
- the Allow policy is restricted to the intended coach
- all required Worker variables are configured
- anonymous read/write verification passes
- wrong-coach verification passes
- logout and session-expiration behavior are tested on a real device
- `SECURITY.md` production checklist is completed

Until those deployment checks pass, use fictional/sanitized athlete data only.

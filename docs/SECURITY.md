# fld.LAB — Security + Privacy Guardrails

fld.LAB will store youth-athlete names and performance results. Keep the first build simple, but do not treat production access as optional once real athlete data is involved.

## 1. Development vs production

Local/mock development may be unauthenticated and may use fictional seed data.

An internet-accessible deployment may also be used for shell/testing work **only with fictional or sanitized data**.

Before entering real athlete names/results into production:

- authentication must be implemented
- team data must require authorized access
- write endpoints must require authorized access
- anonymous requests must not return roster/results
- authorization must be enforced by the Worker, not only hidden in the UI

## 2. Data minimization

MVP intentionally stores only what the training product needs.

Allowed/expected:

- athlete first/last name
- optional birth year
- team membership
- jersey number
- positions
- optional coach notes
- training results

Do not add without a concrete approved requirement:

- full date of birth
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
- real production seed files
- unsanitized screenshots showing athlete information

Use fictional names for fixtures, examples, and screenshots.

## 4. API authorization boundary

The browser is not a trusted security boundary.

Every protected Worker route must verify access server-side before reading or mutating team/athlete/result data.

Never rely on:

- a hidden route
- a disabled button
- a client-supplied team ID by itself
- browser local storage as proof of authorization

For v1, fld.LAB is intentionally a single-coach application. The Worker verifies the Cloudflare Access identity and only authorizes the configured coach email. That one authenticated coach is authorized for the v1 app's teams. Multi-coach/team-role authorization requires a deliberate future data-model change.

## 5. Database access

D1 is accessed only through Worker bindings.

Browser code must never receive:

- D1 management credentials
- Cloudflare administrative credentials
- database IDs/tokens that permit direct administration

Normal path:

```text
Browser → Cloudflare Access → Worker /api/* → env.DB → D1
```

## 6. Secrets

Local Worker secrets belong in `.dev.vars` when needed.

Production secrets and account-specific deployment values are managed through Cloudflare/Wrangler configuration mechanisms.

Never hard-code secrets in TypeScript, JSON, test fixtures, or documentation examples.

The Access issuer, AUD, and authorized coach email are deployment-specific configuration and must not be committed with real account values in this public repository.

## 7. Logging

Do not log full sensitive payloads by default.

Avoid production logs containing:

- full roster dumps
- coach notes
- raw exports
- auth tokens/session credentials

Useful operational logging should prefer IDs, route/state, error category, and request correlation information.

Authentication failures must never log the raw Access JWT.

## 8. Error handling

Client-facing errors must not expose:

- SQL statements/errors
- stack traces
- secret values
- Cloudflare account metadata
- internal authorization logic

Use the structured errors in `API_CONTRACT.md`.

Authentication responses use generic 401/403/503 messages and do not echo tokens or claims.

## 9. Data deletion and history

Normal removal is archival, not destructive deletion.

If a future requirement calls for permanent deletion/export of personal data, implement it deliberately and document the historical consequences.

Do not add casual cascade deletes that can erase training history.

## 10. Backups and exports

Production D1 exports contain athlete information and must be treated as protected data.

Do not store production exports in this public repository.

Use D1 Time Travel for near-term recovery and protected exports only when operationally necessary.

## 11. Authentication implementation decision

The v1 authentication decision is now explicit:

- **identity/access provider:** Cloudflare Access
- **deployment scope:** the fld.LAB Worker hostname, including the current `workers.dev` deployment
- **v1 authorization model:** one configured coach email has access to the v1 application and its teams
- **Worker verification:** validate the `Cf-Access-Jwt-Assertion` signature, issuer, application audience, expiration/not-before timing, subject, and email before protected API routing
- **sign-in:** Cloudflare Access; One-Time PIN is acceptable for the one-coach deployment
- **sign-out:** `/cdn-cgi/access/logout`
- **local development:** explicit `AUTH_MODE=development`, accepted only on localhost/loopback
- **account recovery:** handled by the configured Cloudflare Access identity method, not by fld.LAB password storage

Protected API requests fail closed when production authentication configuration is absent or invalid.

See `docs/AUTH.md` for deployment configuration and verification steps.

This decision does **not** introduce multi-coach roles. When the product requires multiple coaches, organizations, or team sharing, add a server-side coach/team authorization model deliberately rather than broadening the v1 email allowlist.

## 12. Production readiness gate

Merging authentication code is not the same as completing production verification.

A build is **not approved for real youth-athlete production data** until all are true:

- [ ] Cloudflare Access is enabled on the deployed fld.LAB hostname
- [ ] the Access Allow policy is restricted to the intended coach account
- [ ] production auth variables are configured (`AUTH_MODE`, Access team domain, Access AUD, authorized coach email)
- [ ] unauthenticated roster/result reads are blocked and direct protected API access without a valid JWT returns 401
- [ ] unauthenticated writes are blocked and do not reach D1 mutation logic
- [ ] a valid token for a non-authorized coach is rejected with 403
- [ ] authorization is enforced by the Worker, not only the Access UI/policy
- [ ] secrets/tokens are not committed
- [ ] production DB/export files are not committed
- [ ] test/preview deployments do not point at production D1 by default
- [ ] error responses do not leak internal details
- [ ] real-device logout behavior has been tested
- [ ] real-device session-expiration behavior has been tested

Until every deployment check above is verified, use fictional/sanitized data only.

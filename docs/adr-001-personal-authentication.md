# ADR 001 — Personal account access

Status: accepted for the hardening milestone (10).

## Context

The deployed application exposes personal history, destructive actions and Spotify
credentials. Selecting the first user in a route is not authentication. The initial
product has one owner, while user-owned records already have explicit user IDs.

## Decision

Provide a password-only owner login, without public signup. Configure the exact
existing account through `AUTH_USER_ID` and a salted scrypt `AUTH_PASSWORD_HASH`.
An offline setup command generates a 192-bit random password and preserves the
existing user when there is exactly one. Multiple accounts require an explicit ID.
There is no automatic account selection in runtime request handlers.

Use opaque 256-bit random sessions in HttpOnly, SameSite=Lax cookies, Secure in
production. Store SHA-256 token digests, user ownership, expiry and a credential
version in PostgreSQL. Sessions last seven days; logout deletes the stored digest.
Changing the password hash invalidates prior sessions on their next request.

Check authorization in every API handler, before payload processing or provider
calls, in addition to redirecting unauthenticated private page requests. Match
browser mutation origins against `APP_ORIGIN`, which is mandatory and HTTPS in
production. Do not trust forwarded host headers for CSRF authorization.

The scheduler may use its own secret only on POST sync and AI refresh, scoped to
the configured owner. Missing configuration, unavailable session storage, invalid
credentials and absent secrets fail closed, including in development.

Track login attempts with an atomic database upsert, allowing ten per fixed
fifteen-minute window across all instances. Do not base this on client-supplied IP
headers. This personal-account compromise allows a denial of new logins during an
attack; existing sessions continue working. A future multi-user login should use
an established identity provider, recovery flow and account-specific rate controls.

Spotify OAuth state is additionally bound to the authenticated owner. Feedback
must belong to both the authenticated owner and the session named in the URL.
History reset deletes sync runs only through connections owned by the caller.

## Alternatives and dependencies

An external identity provider offers recovery, MFA and multi-user login, but needs
provider setup and a broader account lifecycle. For the current one-owner scope,
Node crypto and the existing database suffice; no dependency is added. PostgreSQL
stores revocable sessions and shared attempt limits, avoiding an in-memory limit
that would reset or split across serverless instances.

## Deployment and validation

Apply the additive `20261020000000_personal_auth` migration. Configure access with
`node scripts/setup-auth.mjs` locally and copy the authentication environment values
into the deployment settings, using the production HTTPS APP_ORIGIN. Restart after
credential changes. Do not deploy without these values: requests will be denied.

Tests cover password checks, session expiry and revocation, credential changes,
cross-origin writes, scheduler isolation, shared attempt limits, login responses,
and anonymous denial at every private route entry point. Real provider calls are
excluded from the test suite.

## Port to the current Arcadium interface

Authentication is based on `origin/master` at `bd9eae2`, which contains the
conversation interface. The private layout keeps AppShell, and the new
`/api/conversation` endpoint checks authentication before reading data or scheduling
AI work. Login and logout use Arcadium's current typography and CSS variables.
The old masthead and `/api/ai/pack` route remain removed as intended upstream.
Existing authentication configuration and session cookie names are preserved so
the update does not require another password or invalidate active sessions.

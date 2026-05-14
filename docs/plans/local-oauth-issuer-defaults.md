# Plan: local OAuth issuer defaults

## Status

Proposed. Bug confirmed in current code.

## Problem

Local startup can use the production/site domain as the auth-service issuer instead of a localhost issuer.

Observed behavior:

- a brain has a configured public domain like `https://yeehaa.io`
- local `brain start` runs on `http://localhost:8080`
- auth-service uses the public domain as issuer
- first-passkey setup URL becomes production-shaped, e.g. `https://yeehaa.io/setup?token=...`
- visiting the equivalent localhost URL fails with:
  - `Untrusted OAuth issuer`

This breaks the intended local OAuth/passkey bootstrap flow and nudges operators toward the deprecated `MCP_AUTH_TOKEN` fallback even though OAuth is supposed to replace it.

## Goal

Make local startup default to a localhost-compatible OAuth issuer and setup flow without requiring per-app overrides.

## Non-goals

- changing deployed/production issuer behavior
- reviving static-token MCP auth as the preferred path
- requiring every app to manually set `plugins.auth-service.issuer` for local development

## Expected behavior

For local app runs:

- first-passkey setup should produce a local URL such as:
  - `http://localhost:8080/setup?token=...`
- local browser requests to localhost should be trusted by auth-service
- OAuth-capable local MCP clients should be able to complete the browser/passkey flow against localhost

For deployed runs:

- issuer should remain the configured public origin
- production OAuth metadata and setup/login flows should continue to use the public domain

## Assessment

Yes — the bug described here is real in the current implementation.

Why:

- `shell/auth-service/src/auth-service-plugin.ts` still defaults the issuer with `this.config.issuer ?? context.siteUrl`
- `shell/plugins/src/base/context.ts` derives `context.siteUrl` from the configured domain as `https://${domain}` rather than from the local webserver origin
- `shell/auth-service/src/auth-service.ts` only auto-allows localhost request issuers when the configured issuer is itself loopback (`allowLocalhostIssuers ?? isLoopbackIssuer(this.issuer)`)

So if a brain has a public domain configured and is started locally on `localhost`, auth-service can still choose the public domain as its issuer, and localhost requests then fail issuer trust checks with `Untrusted OAuth issuer`.

## Confirmed root cause

`auth-service` currently defaults its issuer from app/site context when no explicit auth-service issuer is configured.

Relevant code path:

- `shell/auth-service/src/auth-service-plugin.ts`
  - `const issuer = this.config.issuer ?? context.siteUrl;`

In local development, `context.siteUrl` can still reflect the configured public domain from the app model/config, while the actual running origin is localhost.

## Proposed approach

### Option A: local startup injects a localhost issuer

At app startup, when running a local webserver instance, pass an explicit localhost issuer into auth-service unless the operator explicitly configured one.

Pros:

- clear separation between local and deployed runtime behavior
- no ambiguity inside auth-service itself

### Option B: auth-service/plugin chooses localhost when runtime host is local

Teach auth-service/plugin registration to prefer localhost issuer for local runs when no explicit issuer is configured.

Pros:

- centralized behavior
- no per-app fix needed

### Additional requirement

Regardless of where the default is chosen:

- explicit `plugins.auth-service.issuer` must still win
- deployed/prod environments must keep their configured public issuer
- localhost should not be rejected as untrusted during intended local bootstrap

## Recommended direction

Adopt a framework-level local-runtime default:

- if running locally and no explicit auth-service issuer is set, use the local webserver origin (`http://localhost:<port>`) as issuer
- keep production/public issuer behavior unchanged for deployed environments

This preserves the documented local setup flow and avoids forcing operators onto deprecated token auth.

## Test plan

Add regression coverage for:

1. **Local startup with configured public domain**
   - app domain/public site URL is production-like
   - local webserver runs on localhost
   - auth-service setup URL resolves to localhost

2. **Local `/setup` flow works**
   - GET local setup URL succeeds
   - no `Untrusted OAuth issuer` error

3. **Explicit auth-service issuer override**
   - when `plugins.auth-service.issuer` is set, that exact issuer is used

4. **Production/deployed path unchanged**
   - deployed/public issuer remains the configured public origin

## Verification

This plan is done when:

- local first-passkey setup no longer points at the production domain by default
- local OAuth/passkey setup works without `MCP_AUTH_TOKEN`
- deployed OAuth behavior is unchanged
- tests cover local-vs-production issuer selection

## Notes

This is separate from local env loading and separate from the directory-sync bootstrap bug. The issue here is local OAuth issuer selection/defaulting.

# Auth service

`@brains/auth-service` owns the embedded authentication, authorization-subject, and private identity runtime for a brain. It provides OAuth/OIDC metadata and grants, WebAuthn passkeys, browser sessions, people and users, role/status enforcement, identity claims, exact interface-principal grants, invitation state, audit events, and A2A signing/trust persistence.

## Boundaries

Auth state is private runtime state, not content:

- durable authored content remains entity-driven and may be synchronized through `brain-data`;
- auth state lives in `auth.db` outside `brain-data` and must be persisted by deployments;
- Anchor profile content remains owned by the identity/Studio boundary;
- channel descriptors and delivery providers are owned by message interfaces through the app-scoped channel registry;
- deployment mounts, remote backup retention, and point-in-time recovery are operator concerns.

Studio hosts the browser management presentation. Its Account workspace uses this package's session-derived `/auth/account/*` self-service contracts without role or status mutation, while Admin-owned declarative workspaces use the Admin-only `/auth/admin/*` operations. Auth-service retains route, authorization, same-origin, invariant, and audit ownership for both families.

## Runtime database

The database is local Turso, defaulting to `./data/auth/auth.db`. [`runtime-schema.ts`](./src/runtime-schema.ts) is the canonical schema, and [`drizzle/`](./drizzle/) contains the generated migration history. The database enables foreign keys and WAL; its directory and file are restricted to `0700` and `0600`. Shutdown awaits admitted writes, a checkpoint, and the native handle's close. Remote URLs and the former libSQL replica configuration are not supported. A verified Turso backup/restore replacement is a 0.3 release gate; removing replication does not by itself provide a backup.

Deployments must persist the configured auth storage directory across container replacement. Never place it under synchronized `brain-data`. See the [deployment guide](../../packages/brain-cli/docs/deployment-guide.md) and [brain configuration reference](../../packages/brain-cli/docs/brain-yaml-reference.md).

Legacy JSON/JWK auth files are optional manual backups only. `AuthService` never reads or imports them. Generated Drizzle migrations are the only supported database history; unsupported pre-Drizzle development databases fail closed.

## OAuth client registration

The authorization server advertises Client ID Metadata Document (CIMD) support. HTTPS URL client IDs are resolved on authorization, validated against the document's exact `client_id` and `redirect_uris`, cached according to HTTP cache headers, and persisted for code and token exchange. Document fetches reject local/private destinations, validate redirects, time out, and enforce the 5 KiB response limit. CIMD currently supports public clients using `token_endpoint_auth_method: "none"`.

The deprecated Dynamic Client Registration endpoint remains available at `/register` for compatibility. It accepts `application_type` and enforces its redirect URI constraints when supplied. Dynamically registered credentials are bound to the authorization-server issuer that created them; CIMD URL identifiers remain portable across authorization servers as required by the specification.

## Subject and permission model

A person is the stable local human subject. An auth user is that person's account facet and carries one role (`admin`, `trusted`, or `public`) and one status (`active`, `invited`, or `suspended`). Anchor identity is independent from permission: Admin does not imply Anchor, and a personal Anchor must remain an active Admin.

Request authorization follows one path:

1. resolve a connected active account first;
2. deny connected inactive or suspended accounts without falling through;
3. otherwise resolve a hashed standalone exact-principal grant from `auth.db`;
4. apply contextual pattern/shared-space rules as explicit request policy; and
5. resolve Anchor identity independently.

Exact grants from `brain.yaml` are first-start bootstrap and explicit recovery input, not a request-time authorization fallback. Reversible channel destinations remain private person claims and are omitted from public responses, model context, logs, invitation attempts, and audit metadata.

## Invitations and setup

Invitations and provider attempts are durable, separate rows. Account creation is transactionally idempotent; provider work occurs outside the transaction. Automatic delivery requires an available registered channel provider. Explicit manual delivery stays pending until an active Admin confirms it. Resend rotates the setup token, cancellation is terminal, and only provider acceptance or audited manual confirmation makes the current delivery claimable.

The global first-passkey setup flow is single-use. Registering a passkey establishes the account session; setup is suppressed once an active passkey exists.

## Recovery

Two destructive or deliberate local recovery commands operate directly on `auth.db`:

- `brain auth reset-passkeys --yes` clears passkeys and active authentication/setup state while preserving users, non-passkey identities, OAuth clients, and signing keys;
- `brain auth reinitialize-access --yes` reapplies exact bootstrap grants and Anchor bindings from configuration.

See the [CLI reference](../../packages/brain-cli/docs/cli-reference.md) for flags and operational cautions.

## Implementation map

- [`runtime-db.ts`](./src/runtime-db.ts) — Turso database lifecycle, permissions, pragmas, and migrations
- [`runtime-schema.ts`](./src/runtime-schema.ts) — canonical Drizzle tables and constraints
- [`principal-service.ts`](./src/principal-service.ts) — bearer and interface-principal resolution
- [`user-management-service.ts`](./src/user-management-service.ts) — role/status and Admin/Anchor invariants
- [`invitation-service.ts`](./src/invitation-service.ts) — invitation transactions and lifecycle
- [`auth-request-router.ts`](./src/auth-request-router.ts) — OAuth, WebAuthn, setup, Admin, and Account route dispatch
- [`test/`](./test/) — database, clean-cutover, authorization, endpoint, invitation, and recovery coverage

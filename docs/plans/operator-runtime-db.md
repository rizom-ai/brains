# Operator runtime database

## Goal

Introduce a dedicated operator runtime database for private, non-content state that currently lives in small plugin-local files. This should make hosted Rover operations safer and easier to evolve without mixing operator/security state into entity content.

## Scope

The operator DB is for runtime control-plane state, not durable user-authored content. Initial candidates:

- notification delivery dedupe records
- setup-email delivery dedupe records
- auth/passkey/OAuth runtime stores
- operator sessions, approval tokens, refresh tokens
- future operator audit events and delivery history

Out of scope for the first pass:

- replacing entity/content storage
- multi-tenant shared database design
- analytics/event warehousing
- large migration tooling beyond current deployed stores

## Proposed direction

Use a small SQLite/libSQL-backed database owned by the app runtime and located under the existing runtime data directory. Expose it through a narrow shell-level service, for example `operatorRuntimeStore`, instead of letting every plugin open its own database.

The storage path must be explicit and deployment-safe. Today the main shell databases follow `XDG_DATA_HOME` and land under `/data` in containers, while auth-service defaults to the relative path `./data/auth`, which becomes `/app/data/auth` under the Docker `WORKDIR`. That mismatch can make passkeys, OAuth clients, sessions, and setup-email dedupe ephemeral even when the main DBs are persisted. The operator runtime DB plan should eliminate that ambiguity.

Suggested properties:

- private by default; never synced to Git or content directories
- stored under the runtime data root, preferably `XDG_DATA_HOME`, not under `brain-data`
- mounted persistently by every hosted deploy template before any passkey/user onboarding flow is enabled
- schema-versioned with simple migrations
- safe for secrets and token-adjacent metadata
- usable by service plugins without depending on concrete DB details
- easy to swap to remote/libSQL later for hosted multi-instance deployments

## Incremental path

1. Fix the hosted Rover persistence contract immediately:
   - either persist `/app/data` wherever auth-service still writes `./data/auth`, or
   - preferably move auth-service's default storage root to `XDG_DATA_HOME` so hosted auth state lands under the already-persisted `/data` volume.
2. Add regression coverage that generated deploy templates persist the auth/operator-runtime storage path.
3. Keep immediate Rover setup-email dedupe file-backed behind a small storage interface until the DB service exists.
4. Define the operator DB service contract and ownership boundary in shell/app or a shared shell package.
5. Move setup-email/notification dedupe to the operator DB as the first low-risk consumer.
6. Migrate auth-service JSON runtime stores once the DB lifecycle and backup/restore story is proven.
7. Add optional audit/delivery history only after dedupe/auth use cases are stable.

## Compatibility and migration notes

Existing hosted installs may already have auth state under `/app/data/auth`. The migration path must avoid silently resetting passkeys:

- detect existing `/app/data/auth` before changing the default auth storage root
- copy or migrate passkeys, OAuth clients, signing keys, sessions, refresh tokens, and setup-email dedupe records into the new runtime location
- preserve file permissions for token-bearing stores
- make reset/destructive recovery explicit through `brain auth reset-passkeys --yes`, never an accidental side effect of deploy
- verify after deploy with `brains-ops verify-user` and, where needed, an auth-state-specific check that does not expose secrets

## Open questions

- Should the first implementation use Bun SQLite directly or the repo's existing Drizzle/libSQL patterns?
- What is the backup/restore policy for hosted operator state?
- Which data must be encrypted at rest versus protected by host/filesystem permissions?
- Do we need cross-process locking now, or only when hosted deployments become multi-instance?

# Operator runtime database

## Goal

Introduce a dedicated operator runtime database for private, non-content state that currently lives in small plugin-local files. This should make hosted Rover operations safer and easier to evolve without mixing operator/security state into entity content.

## Scope

The operator DB is for runtime control-plane state, not durable user-authored content. Initial candidates:

- notification delivery dedupe records
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

Suggested properties:

- private by default; never synced to Git or content directories
- schema-versioned with simple migrations
- safe for secrets and token-adjacent metadata
- usable by service plugins without depending on concrete DB details
- easy to swap to remote/libSQL later for hosted multi-instance deployments

## Incremental path

1. Keep immediate Rover setup-email dedupe file-backed behind a small storage interface.
2. Define the operator DB service contract and ownership boundary in shell/app or a shared shell package.
3. Move notification dedupe to the operator DB as the first low-risk consumer.
4. Migrate auth-service JSON runtime stores once the DB lifecycle and backup/restore story is proven.
5. Add optional audit/delivery history only after dedupe/auth use cases are stable.

## Open questions

- Should the first implementation use Bun SQLite directly or the repo's existing Drizzle/libSQL patterns?
- What is the backup/restore policy for hosted operator state?
- Which data must be encrypted at rest versus protected by host/filesystem permissions?
- Do we need cross-process locking now, or only when hosted deployments become multi-instance?

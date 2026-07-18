# Operator runtime database

## Status

Proposed durable operator/security tier. The separate ephemeral operational tier already
ships as `shell/runtime-state`; this plan does not duplicate it. This plan owns the
persisted, private database needed for identity and security state whose loss would cause
a lockout or security incident. Auth-specific schema and migration details are tracked in
[Auth runtime database](./auth-runtime-db.md).

## Goal

Establish one deployment-safe, backed-up database boundary for credentials, sessions,
tokens, identity bindings, and audit state. It must live under the canonical runtime data
root, never under `brain-data`, and must not share a physical store with disposable
operational state.

The existing `shell/runtime-state` service remains the home for recoverable, secret-free
state such as chat subscriptions, playbook runs, and delivery dedupe. The two tiers may
share engineering patterns, but not lifecycle or storage.

## Source of truth

This plan owns the durable storage boundary, storage-root/deploy persistence contract,
backup/restore expectations, and operator DB lifecycle. It intentionally does not own
auth table schemas or multi-user behavior:

- auth schema, auth migrations, and `single-operator` migration live in [Auth runtime database](./auth-runtime-db.md)
- roles, permissions, People UX, and runtime user behavior live in [Multi-User & Permissions](./multi-user.md)

## Scope

The operator DB is for durable operator/security state, not durable user-authored content and not disposable operational state. Initial candidates:

- auth/passkey/OAuth runtime stores
- operator sessions, approval tokens, refresh tokens
- identity bindings (e.g. `discord:<id>` → user)
- future operator audit events and delivery history

Owned by the runtime state store (`shell/runtime-state`) (ephemeral tier, not here):

- chat thread subscriptions
- playbook run state: runs, typed evidence rows, gate verdicts
- notification / setup-email delivery dedupe records

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

### Plugin-facing store

Plugins consume this service through a narrow, namespaced handle rather than a raw database. The precedent already in the tree is `RuntimeUploadRegistry` / `RuntimeUploadStore` (`shell/plugins/src/service/upload-registry.ts`), which hands each plugin a namespaced runtime store rooted under the shell `dataDir`. Generalize that shape:

- the shell owns the single libSQL connection, schema migrations, file permissions, and cross-process write safety
- a plugin declares a typed store (its own tables/rows) and receives CRUD against it through plugin context, which already exposes `dataDir` (`shell/plugins/src/base/context.ts`)
- a plugin never opens a database, never ships a migration, and never resolves its own `./data/<plugin>` path

This is the "shell-owned runtime persistence" the onboarding plan defers to. The relative-path default is not a one-plugin quirk — auth-service (`./data/auth`) and the in-flight playbooks run store (default `./data/playbooks`) both default to a plugin-relative root that resolves under the Docker `WORKDIR` instead of the canonical `dataDir`. The service closes that footgun by owning the path.

The same plugin-facing shape is shared by the runtime state store (`shell/runtime-state`); the difference is the physical store and tier, not the interface. Playbook runs are a worked example of that shape, but as an **ephemeral-tier** consumer they live in the runtime state store, not here: the hand-rolled `runs.json` store (from the in-flight playbooks work) collapses into normalized `playbook_runs` / `playbook_evidence` / `playbook_gate_verdicts` tables there. Within this operator plan, the worked example is auth: JSON/JWK files in `./data/auth` migrating onto the durable operator store.

## Incremental path

1. Fix the hosted Rover persistence contract immediately:
   - either persist `/app/data` wherever auth-service still writes `./data/auth`, or
   - preferably move auth-service's default storage root to `XDG_DATA_HOME` so hosted auth state lands under the already-persisted `/data` volume.
2. Add regression coverage that generated deploy templates persist the auth/operator-runtime storage path.
3. Keep immediate Rover setup-email dedupe file-backed behind a small storage interface until the DB service exists.
4. Define the operator DB service contract and ownership boundary in shell/app or a shared shell package.
5. Migrate auth-service JSON runtime stores according to [Auth runtime database](./auth-runtime-db.md) once the DB lifecycle and backup/restore story is proven. (Setup-email/notification dedupe is no longer the first consumer here — as ephemeral state it moves to the runtime state store (`shell/runtime-state`).)
6. Add optional audit/delivery history only after the auth migration is stable.

## Compatibility and migration notes

Existing hosted installs may already have auth state under `/app/data/auth`. The migration path must avoid silently resetting passkeys:

- detect existing `/app/data/auth` before changing the default auth storage root
- copy or migrate passkeys, OAuth clients, signing keys, sessions, refresh tokens, and setup-email dedupe records into the new runtime location
- preserve file permissions for token-bearing stores
- make reset/destructive recovery explicit through `brain auth reset-passkeys --yes`, never an accidental side effect of deploy
- verify after deploy with `brains-ops verify-user` and, where needed, an auth-state-specific check that does not expose secrets

## Resolved decisions

- Use the repo's existing Drizzle/libSQL pattern for runtime SQLite/libSQL storage, following `shell/entity-service` and `shell/job-queue`. Do not introduce Bun SQLite as a second DB stack.
- Plugins consume the runtime-state service; they do not own DB infrastructure. No plugin-private SQLite, no per-plugin migration packaging, no plugin-relative `./data/<plugin>` storage root. Stores resolve under the shell `dataDir` (XDG_DATA_HOME) so they land on the canonical persisted volume, not an accidental `/app/data/...`.
- A persistence need is not a reason to promote a plugin into shell. The storage primitive is shell; the domain logic stays in the plugin. Playbooks needing durable runs pulls the runtime-state store into shell and leaves the plugin where it is.

## Open questions

- What is the backup/restore policy for hosted operator state beyond "covered by the persisted runtime data root"?
- Which data must be encrypted at rest versus protected by host/filesystem permissions?
- Do we need cross-process locking now, or only when hosted deployments become multi-instance?

## Resolved: store layout by tier

The earlier open question — "one shared runtime-state DB file, or one per consumer?" — is resolved by splitting on tier rather than per consumer:

- **Durable operator/security tier (this plan):** its own private file (e.g. `auth`/operator DB), strict permissions, backed up. Auth's isolation requirement is satisfied by the tier boundary.
- **Ephemeral operational tier:** a single shared the runtime state store (`shell/runtime-state`) file with per-consumer table namespaces (chat subscriptions, playbook runs, dedupe). No per-consumer files; they share a profile (tiny, secret-free, disposable).
- **Already-separate by scale/lifecycle:** `brain-jobs.db` (job queue) and `embeddings.db` stay their own files; they are not folded into either tier.

## Related plans

- `shell/runtime-state` — the shipped ephemeral operational tier this plan is deliberately not part of
- [Auth runtime database](./auth-runtime-db.md)
- [Multi-user and permissions](./multi-user.md)

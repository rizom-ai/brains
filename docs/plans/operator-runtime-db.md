# Operator runtime database

## Status

Proposed foundation. This plan owns the shared runtime-state persistence service that several plugins consume. Auth-specific schema and migration details are tracked in [Auth runtime database](./auth-runtime-db.md); playbook run state is tracked as a consumer in [Rover chat-native onboarding](./rover-chat-native-onboarding.md). This plan remains the broader runtime-state ownership and persistence boundary.

## Goal

Introduce a shell-owned runtime-state persistence service for private, non-content state that today lives in scattered plugin-local files. It gives plugins a narrow, namespaced store so they can persist runtime state without each one opening its own database, inventing its own write-safety, or shipping its own migrations. This makes hosted Rover operations safer and easier to evolve without mixing operator, security, or runtime state into entity content — and without every plugin re-solving persistence by hand.

Auth-specific schema and migration details are split out in [Auth runtime database](./auth-runtime-db.md). Playbook run state ([Rover chat-native onboarding](./rover-chat-native-onboarding.md)) is a first-class consumer of this service, not plugin-private storage. The name "operator runtime database" is historical; the boundary is general runtime state, and any private non-content store that a plugin would otherwise hand-roll belongs here.

## Source of truth

This plan owns the runtime-state boundary, storage-root/deploy persistence contract, backup/restore expectations, and shared operator DB service shape. It intentionally does not own auth table schemas or multi-user behavior:

- auth schema, auth migrations, and `single-operator` migration live in [Auth runtime database](./auth-runtime-db.md)
- roles, permissions, People UX, and runtime user behavior live in [Multi-User & Permissions](./multi-user.md)

## Scope

The runtime-state DB is for runtime control-plane and plugin runtime state, not durable user-authored content. Initial candidates:

- notification delivery dedupe records
- setup-email delivery dedupe records
- auth/passkey/OAuth runtime stores
- operator sessions, approval tokens, refresh tokens
- playbook run state: runs, typed evidence rows, gate verdicts ([Rover chat-native onboarding](./rover-chat-native-onboarding.md))
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

### Plugin-facing store

Plugins consume this service through a narrow, namespaced handle rather than a raw database. The precedent already in the tree is `RuntimeUploadRegistry` / `RuntimeUploadStore` (`shell/plugins/src/service/upload-registry.ts`), which hands each plugin a namespaced runtime store rooted under the shell `dataDir`. Generalize that shape:

- the shell owns the single libSQL connection, schema migrations, file permissions, and cross-process write safety
- a plugin declares a typed store (its own tables/rows) and receives CRUD against it through plugin context, which already exposes `dataDir` (`shell/plugins/src/base/context.ts`)
- a plugin never opens a database, never ships a migration, and never resolves its own `./data/<plugin>` path

This is the "shell-owned runtime persistence" the onboarding plan defers to. The relative-path default is not a playbooks quirk — auth-service (`./data/auth`) and the playbooks run store (`./data/playbooks`, `plugins/playbooks/src/plugin.ts`) both default to a plugin-relative root that resolves under the Docker `WORKDIR` instead of the canonical `dataDir`. The service closes that footgun by owning the path.

Playbook runs become a worked example of a consumer: the hand-rolled `runs.json` store (`plugins/playbooks/src/run-store.ts` — an in-process write-queue, atomic temp+rename writes, manual evidence/verdict array merges, file-scan queries, version-pin-by-convention) collapses into normalized `playbook_runs` / `playbook_evidence` / `playbook_gate_verdicts` tables. Cross-process write safety, queryable typed evidence rows, and real migrations come from the service instead of plugin code. The plugin keeps its `PlaybookRun` schema and store API behind the interface; only the backing storage moves. The plugin stays a plugin — this service is the storage primitive it consumes, the same way content plugins consume `entity-service`.

## Incremental path

1. Fix the hosted Rover persistence contract immediately:
   - either persist `/app/data` wherever auth-service still writes `./data/auth`, or
   - preferably move auth-service's default storage root to `XDG_DATA_HOME` so hosted auth state lands under the already-persisted `/data` volume.
2. Add regression coverage that generated deploy templates persist the auth/operator-runtime storage path.
3. Keep immediate Rover setup-email dedupe file-backed behind a small storage interface until the DB service exists.
4. Define the operator DB service contract and ownership boundary in shell/app or a shared shell package.
5. Move setup-email/notification dedupe to the operator DB as the first low-risk consumer.
6. Migrate auth-service JSON runtime stores according to [Auth runtime database](./auth-runtime-db.md) once the DB lifecycle and backup/restore story is proven.
7. Add optional audit/delivery history only after dedupe/auth use cases are stable.

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
- One shared runtime-state DB file with per-consumer table namespaces, or one DB file per consumer under the same `dataDir`? (Job-queue already uses a separate file by design; auth wants its own private file. Playbook runs have no such isolation requirement and could share.)

## Related plans

- [Auth runtime database](./auth-runtime-db.md)
- [Rover chat-native onboarding](./rover-chat-native-onboarding.md)
- [Multi-user and permissions](./multi-user.md)

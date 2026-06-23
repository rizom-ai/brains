# Runtime state store

## Status

Service shipped (`shell/runtime-state`); the chat subscription consumer has landed, with playbooks and notification/setup-email dedupe still pending. This plan owns the shell-owned persistence service for **ephemeral operational state** — private, non-content state that is recoverable on loss and carries no secrets.

The foundation has landed: `shell/runtime-state` ships `RuntimeStateService` and `RuntimeStateStore` (with `schema/` and `migrate.ts`), wired into `shell/core/src/initialization/service-factory.ts` and exposed to plugins via `shell/plugins/src/base/context.ts` (`context.runtimeState`). The first consumer, `@brains/chat` Discord thread subscriptions, has also landed. Next consumers: playbook run state ([Rover chat-native onboarding](./rover-chat-native-onboarding.md)) and notification/setup-email delivery dedupe.

## Tier boundary

This store is deliberately scoped to the **runtime tier**, not the operator/admin tier. The distinction is the design decision behind this plan:

- **Operator / admin tier** — durable, secret-bearing, security-critical identity state: users, credentials, passkeys, OAuth grants, sessions, tokens, audit. High consequence of loss; backed up; locked-down permissions; never synced. Owned by [Operator runtime database](./operator-runtime-db.md) and [Auth runtime database](./auth-runtime-db.md). **Not in scope here.**
- **Runtime tier (this plan)** — ephemeral operational state: recoverable on loss (re-mention the bot, re-run an onboarding step, at worst a duplicate send), no secrets, reset-friendly.

"Ephemeral" is not itself the grouping axis — embeddings and the job queue are ephemeral too (embeddings are fully regenerable from entity content) yet keep their own databases because their scale, perf profile, and reset lifecycle differ. This store is for the small, hand-rolled-or-net-new operational fragments that share one profile: tiny, secret-free, no special indexing, and currently each tempted to invent its own persistence.

## Goal

Give plugins and interfaces a narrow, namespaced store for ephemeral runtime state so none of them opens its own database, invents its own write-safety, or ships its own migrations. The shell owns the single libSQL connection, schema migrations, file permissions, cross-process write safety, and the storage path; a consumer declares its own typed tables and receives CRUD through plugin context (which already exposes `dataDir`, `shell/plugins/src/base/context.ts`).

The precedent already in the tree is `RuntimeUploadRegistry` / `RuntimeUploadStore` (`shell/plugins/src/service/upload-registry.ts`), which hands each plugin a namespaced runtime store rooted under the shell `dataDir`. This generalizes that shape into a schema-backed service.

## Scope

In scope:

- Discord thread subscriptions (chat — first consumer).
- Playbook run state (`playbook_runs` / `playbook_evidence` / `playbook_gate_verdicts`), replacing the hand-rolled `runs.json` (`plugins/playbooks/src/run-store.ts`).
- Notification / setup-email delivery dedupe records.
- Future low-stakes operational fragments that would otherwise be plugin-local files.

Out of scope:

- Auth, sessions, tokens, credentials, audit — the operator/admin tier ([Operator runtime database](./operator-runtime-db.md)).
- Entity content (`brain.db`) and embeddings (`embeddings.db`) — source-of-truth and large/vector-indexed stores keep their own databases.
- The job queue (`brain-jobs.db`) — already a proper Drizzle DB with its own lifecycle; it stays separate.
- Anything secret-bearing or with a strong durability/backup requirement.

## Direction

- A single local libSQL file under the shell `dataDir` (`XDG_DATA_HOME`, the canonical persisted volume), e.g. `runtime-state.db`. Per-consumer table namespaces in the one file.
- Drizzle + `@libsql/client`, following `shell/job-queue` and `shell/entity-service`. Do not introduce `bun:sqlite` as a second DB stack.
- Schema-versioned with simple migrations owned by the shell service.
- Disposable lifecycle: safe to delete and rebuild; not part of the secret/backup-critical surface. (If a future consumer needs durability or secrecy, it belongs in the operator tier, not here.)
- SQLite single-writer transactions provide the atomicity any consumer needs (e.g. dedupe insert-if-absent) without a separate locking layer at current single-instance scale.

### Plugin-facing shape

- The shell owns the connection, migrations, permissions, and write safety.
- A consumer declares a typed store (its own tables/rows) and receives CRUD via context. It never opens a database, never ships a migration, never resolves its own `./data/<plugin>` path.
- Namespacing isolates consumers so their tables/keys never collide.

## First consumer: chat Discord subscriptions

The Chat SDK `StateAdapter` (external `chat` package) covers subscriptions, locks, cache, lists, and queues. Only **subscriptions** need to survive restart — the SDK documents `subscribe(threadId)` as persistent, and the memory adapter loses it on restart, so a user must re-mention the bot before unmentioned thread follow-ups route. Locks are held by live, in-flight handlers and should be empty after restart (a persisted lock is a stale lock); cache and queues are transient.

So the chat consumer persists subscriptions only and keeps the in-memory adapter semantics for locks/cache/queues:

- Back `subscribe` / `unsubscribe` / `isSubscribed` with a namespaced subscriptions table in this store.
- Keep `acquireLock` / `releaseLock` / `extendLock` / `forceReleaseLock`, `get`/`set`/`setIfNotExists`/`delete`, `appendToList`/`getList`, and `enqueue`/`dequeue`/`queueDepth` on the SDK memory adapter.
- Implement `connect()` / `disconnect()` against the shell service (open/migrate is the shell's job; the adapter connects to the provided store).
- Wire both `createChatApp` branches (`interfaces/chat/src/chat-interface.ts`) to use the store-backed adapter when the runtime provides it, falling back to `createMemoryState()` when it does not.
- Revisit persisting queues only if live validation shows queued-inbound-message loss across restart actually matters.

## Acceptance criteria

- A shell-owned runtime-state service exposes a narrow, namespaced, typed store to consumers via context; no consumer opens its own DB or ships migrations.
- The store resolves under `dataDir` (`XDG_DATA_HOME`), not an accidental `/app/data/...` path.
- Subscribed Discord threads continue routing unmentioned follow-up messages after process restart (chat consumer).
- Locks/cache/queues remain in-memory for chat; a restart does not resurrect stale locks.
- Tests cover store recreation to simulate restart.
- The store is documented as disposable/non-secret so future consumers self-select the correct tier.

## Follow-up: migration packaging lists

Runtime-state migrations currently need to be copied by each packaging path that already copies shell migrations: `shell/app/scripts/build.ts`, `shell/app/scripts/build-model.ts`, and `packages/brain-cli/scripts/build.ts`. This slice keeps those lists in sync without refactoring. A later cleanup should centralize the migration source list so new shell databases do not require three separate edits.

## Sequencing

1. Build the service + minimal store in this worktree, with the chat subscriptions consumer proving the interface.
2. Merge into the playbook worktree; add `playbook_runs` / `playbook_evidence` / `playbook_gate_verdicts` as the second consumer (migrating `runs.json`).
3. Add notification/setup-email dedupe as a third low-risk consumer.

## Related plans

- [Rover chat-native onboarding](./rover-chat-native-onboarding.md) — playbook run state consumer.
- [Operator runtime database](./operator-runtime-db.md) — the operator/admin durable tier this store is deliberately _not_ part of.
- [Auth runtime database](./auth-runtime-db.md) — auth schema within the operator tier.

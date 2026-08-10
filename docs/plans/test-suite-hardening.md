# Plan: Test suite hardening

## Status

**In progress — 2026-08-09; Phases 0 through 3 complete.** This is not a rescue plan: the suite is green and structurally healthy today. Every remaining phase targets a drift mechanism or a dead spot rather than failing behavior, so no phase gates a release. Phases are independently shippable and ordered so each one makes the next safer.

## Goal

Make the existing test suite's guarantees hard to lose:

- a test file that exists always runs;
- a mock that no longer matches its interface fails to compile;
- test database setup has one implementation with one cleanup contract;
- each shared mock has exactly one definition;
- the evaluation CLI that CI depends on is itself under test;
- tests synchronize on conditions, not on guessed sleep durations;
- no test file carries an unsafe cast.

## Current baseline

The suite is in good shape, and the plan depends on that staying true.

1. `bun run test` runs 99 turbo tasks green in well under two minutes. Shell alone is 17 packages in ~13s.
2. There are zero unconditional `.skip`, `.only`, and `.todo` markers. Four tests use `it.skipIf`, each gating an opt-in soak or remote-contract run behind an environment variable (`RUN_IMPORT_BURST_SOAK`, `RUN_SOAK`, `RUN_SMOKE_TESTS`, `JOB_QUEUE_REMOTE_TEST_URL`) and each documenting its invocation. These are deliberate opt-ins, not disabled tests — but they never run in CI, so nothing detects them rotting.
3. Weak assertions (`toBeDefined`, `toBeTruthy`, `toBeFalsy`, `toBeUndefined`, `toBeNull`, bare `not.toThrow`) are 6–10% of all `expect()` calls per layer — 8.7% in `shell/`, 10.4% in `shared/`, 2.7% in `packages/`.
4. Interaction assertions (`toHaveBeenCalled*`) are 7.3% of expects in `shell/` and 1.7% in `shared/`. Tests assert outcomes, not call logs. `interfaces/` is the outlier at 15.2%.
5. No test file is assertion-free.
6. `mock.module` appears 15 times repo-wide, almost always against genuinely external dependencies (`ai`, `@ai-sdk/*`, `@chat-adapter/*`, the npm `chat` package). One exception remains: `packages/brain-cli/test/remote-operate.test.ts` mocks its own `../src/lib/mcp-client`. That fix is in flight in the main checkout, not on this branch.
7. Test names are behavioral, not structural — `fails closed to public visibility and allows explicit scope widening`, `skips a stale update when the expected content hash changed`.
8. Initialization, registration, and shutdown paths required by `shell/AGENTS.md` are covered: `shell-shutdown.test.ts`, `shell-initialization-order.test.ts`, `service-ownership-integration.test.ts`, plus shutdown drained across four more `core` tests.

Two test-infrastructure homes exist and the split is correct: `@brains/test-utils` (mock factories, 297 consumers) and `@brains/plugins/test` (plugin harness, 144 consumers). This plan keeps both.

Phase 0 shipped the wiring guard: `scripts/test-wiring.test.ts` fails when a package with test files declares no `test` script, when a `scripts/*.test.ts` is not run by a CI-invoked root script, or when a `bun test` path argument in a root script resolves to nothing. It runs in `architecture-ci.yml` via `bun run test:scripts`, which replaced the file-pinned `arch:test`. `sites/professional` now has a `test` script (its stale `artistMediums` passthrough assertion was corrected to match the strict JSON-native schema that superseded it), `scripts/build-roadmap-visual.test.ts` runs for the first time, and the `test:integration` / `test:all` pair that reported a nonexistent suite as green is deleted.

Phase 1 made shared-mock drift a compile error. Every factory in `@brains/test-utils` is now checked against the type it stands in for, and an ESLint rule keeps `as unknown as` out of `shared/test-utils/src`. Three named helpers carry the cases the type system genuinely cannot express, so a reader can tell a known limit from a papered-over mismatch: `PublicSurface<T>` for class nominality, `genericSpy` for the type parameters bun's `mock()` erases, and `spyOnMembers` for wrapping a real namespace in recording spies. The two plugin-context mocks are no longer hand-written at all — they build a real context from a mock shell through `createEntityPluginContext` / `createServicePluginContext`, so their shape cannot drift because it is no longer a separate shape. One documented exception remains: `mockFetch` replaces a global rather than an injected collaborator and its handler deliberately returns a `Partial<Response>`, so there is nothing assignable to check it against.

Phase 2 gave test databases one implementation and one cleanup contract. `createTestDatabase` in `@brains/test-utils` owns the `mkdtemp → migrate → cleanup` flow; clients register through `track()`, `cleanup` closes them all then removes the directory and is idempotent, and a failing migration removes the directory rather than leaking a temp dir per failing test. Migration is injected, so the package still depends on nothing under `shell/`. `createTestDirectory` exposes the directory primitive for tests that need scratch space without a database. The four per-package helpers are gone, along with `job-queue`'s cleanup that opened a connection purely to close it.

Note that ~100 individual test files still call `mkdtemp` inline for their own scratch directories. That is a different pattern from the four helpers — each is local to one file — so this plan does not treat it as _duplication_ to remove. It is, however, a leak, which an earlier version of this note wrongly waved away; see below.

Phase 3 gave each shared mock one definition. All five local `createMockEntityService` redefinitions are gone, along with a dead 160-line `createMockAIService` in `shell/ai-service/test/mock.ts` that nothing imported, the `@deprecated` `mock-shell` shim, and three of site-builder's four identical `createPipelineContext` copies. `scripts/test-wiring.test.ts` now fails when a test file declares a factory that shadows a `@brains/test-utils` export, matching on name **and** declared return type so that same-named locals building a different type — `ShellInstance`, a narrow package-local interface — stay quiet.

Typing the overrides on two of those conversions caught malformed fixtures the untyped bags had hidden: entities built with `createdAt`/`updatedAt` where `BaseEntity` has `created`/`updated`, and with no `contentHash` or `visibility`. Nothing read those fields, so nothing failed.

Three caveats to the baseline. Test files themselves contain 156 `as unknown as` casts across 80 files (94 in `shell/` alone), almost always on inline partial mocks — so the "no casts in test files" property that `test-utils`' header aims for does not hold today; Phase 6 addresses it. `shell/ai-service/test/agent-service.test.ts` is the one file in the repo that reads private service state via `Reflect.get` (the conversation-actor registry probes); Phase 5 replaces those probes while it has the file open. And root-level `scripts/` is linted by nothing — `scripts/lint.mjs` drives turbo, which only visits workspace packages, and the repository root is not one — so the script tests Phase 0 just wired up are unreachable from ESLint; Phase 6 fixes that alongside its own rules.

A static "modules never imported by a test" sweep flagged 25 of 53 modules in `shell/core`. That signal was checked and is mostly transitive-coverage noise — barrel modules such as `messageBus.ts` pull in their collaborators, and the init/shutdown paths it flagged are covered. Only `shell/ai-evaluation` survived the check as a genuine hole. This plan does not act on that sweep beyond Phase 4.

## Problems to solve

### `@brains/test-utils` cannot be depended on by the packages it mocks

`@brains/test-utils` declares eleven workspace dependencies — `ai-service`, `content-service`, `contracts`, `conversation-service`, `entity-service`, `identity-service`, `job-queue`, `mcp-service`, `messaging-service`, `plugins`, `runtime-state`, `templates`, `utils` — because its factories mock those packages' types.

Every one of those packages also imports `@brains/test-utils` in its own tests, and **none of them declares it**: 74 files across eleven packages. They cannot. Adding the dependency creates a cycle, and turbo rejects the task graph outright rather than tolerating it — verified by declaring it on `shell/plugins` and watching `turbo run typecheck` refuse to build a plan. The imports only resolve today because bun hoists the workspace.

So the repository has a large, invisible dependency edge that no manifest records and no check catches: `bun install` is happy, `arch:check` is happy, and turbo's graph is acyclic only because it cannot see the edge.

The fix is directional. A mock of an interface belongs with the package that owns the interface, not in a package that must import it. Moving `mock-shell` into `@brains/plugins` — which already declares every package it imports, so it needs no new dependencies — and re-exporting it from `test-utils` would let `plugins` drop the edge entirely, with no consumer changes. The same reasoning applies to the entity, content and job-queue mocks. That is a package-boundary change rather than test hygiene, so it wants its own decision and is not folded into a phase here.

### The evaluation CLI chain is untested

`shell/ai-evaluation`'s core orchestration is covered: `evaluation-service.test.ts` drives `EvaluationService.runEvaluations` end-to-end with injected chat mocks, which exercises `PluginRunner`, `TestRunner`, the judges, aggregation, and partial-failure handling. `cli-options`, `eval-config-loader`, `eval-db-builder`, and three of five reporters (`markdown`, `comparison`, `model-comparison`) also have direct tests.

What has no coverage by any route is the CLI composition layer that wraps that tested core:

`run-evaluations` → `evaluation-runner` → `single-model-runner` / `multi-model-runner`, plus `cli-bootstrap`, `cli-help`, `load-eval-env`, and the `json-reporter` / `console-reporter` pair.

No test imports any of these, directly or transitively. Model fan-out, reporter selection, environment bootstrap, and exit-code behavior — the parts a CI eval run actually depends on — are the unverified parts.

### Fixed-duration sleeps as synchronization

Tests contain ~120 fixed sleeps (`await new Promise((r) => setTimeout(r, N))` and equivalents), concentrated in `shared/utils` (28), `plugins/directory-sync` (21), `shell/job-queue` (17), `interfaces/a2a` (12), and `interfaces/chat` (10). They split into two families:

- **Synchronization sleeps** — `setTimeout(resolve, 100) // Wait for jobs` in `sync-job-race-condition.test.ts` and siblings. These encode a guess about scheduler latency: too short is flaky under load, long enough to be safe is wasted wall clock on every run. `directory-sync` at 25.4s is the slowest package in the suite largely for this reason.
- **Time-semantics tests** — `debounce.test.ts` and `logger-file.test.ts`, where elapsed time is the behavior under test, currently driven by real 30–80ms timers.

There is no shared wait-for-condition helper anywhere in the repo, which is why the pattern keeps being written by hand. Bun 1.3's test runner supports `jest.useFakeTimers` / `advanceTimersByTime`, so the time-semantics family has a deterministic alternative too.

### The suite fills the disk, and a full disk then corrupts its own results

Observed directly during Phase 3: `/tmp` reached 67G across 153,682 entries, the root filesystem hit 100% with 24M free, and the suite began failing with `failed to write tarball header: Write error` in the packed-authoring tests. Those failures look like test failures and are not.

Two separate leaks produce it, and they need separating because the obvious one is not the expensive one.

**Directory count.** Test files that call `mkdtemp` inline and never remove the directory: 30,929 `brains-cms-editor-auth-`, 29,669 `brains-playbooks-`, 10,980 `brains-ops-init-`, and a long tail. Individually tiny, collectively over a hundred thousand directories. `plugins/cms`, `plugins/playbooks` and `packages/brains-ops` are the main sources — they build a `storageDir` per test and drop it.

**Disk space.** 552 hidden `.*.brain` directories at ~113M each, 60G in total — nine tenths of the problem. Each is an extracted `@rizom/brain` tarball, bun's install-staging area for the packed-consumer tests. Bun removes these on a clean run; they survive when an install is interrupted. That makes it self-reinforcing: a full disk interrupts the next install, which leaks more.

Both belong with Phase 5, since both are tests failing to release something they acquired — the same defect class as a cleanup contract that does not close its clients. The directory leak is fixed by routing those call sites through `createTestDirectory`, which Phase 2 already provides and which removes the directory for them. The staging leak needs the packed tests to pack into a directory they own and delete, rather than letting bun stage into `/tmp`.

Until then, a full-suite run on a nearly full disk cannot be trusted: check free space before believing a packed-test failure.

### Tests bind fixed ports, so two suites cannot run at once

`packages/brain-cli/test/public-authoring-phase5-packed.test.ts` binds hardcoded ports `14010` and `14020`. Observed directly: a full suite run failed with `EADDRINUSE` on 14010 purely because a soak test was running in another worktree at the same time, and the identical test passed in isolation moments later.

The repo already knows the right answer — `import-burst-stability.test.ts` does `Bun.serve({ port: 0 })` and reads back the assigned port, and `packed-consumer-helper.test.ts` likewise avoids a literal. This one file is the exception, so the fix is small and local.

It matters because this repo is worked on through many parallel worktrees, so "only one suite at a time" is not a property anyone can rely on. The failure mode is also maximally misleading: it surfaces as a one-millisecond failure inside an otherwise slow integration test, pointing at a `Bun.serve` line rather than at the collision.

## Non-goals

- Adding a coverage-percentage threshold or a coverage gate to CI. The weak-assertion and interaction-assertion measurements above are better signals for this codebase, and a line-coverage target would reward the tests this plan is trying to prevent.
- Rewriting existing passing tests for style, naming, or structure. Test names are already behavioral.
- Merging `@brains/test-utils` and `@brains/plugins/test`. The mock-factory / plugin-harness split is correct.
- Converting mock factories into in-memory fakes. That is a larger design change with real benefits and real cost; it is not this plan, and Phase 1 does not foreclose it.
- Building an integration test suite. Phase 0 removes the script that falsely claims one exists; writing one is separate work.
- Reducing suite runtime as a goal in itself. At 27s for 99 tasks it is not a problem; Phase 5 will shorten `directory-sync` as a side effect of removing synchronization sleeps, but no phase is justified by speed.
- Splitting large test files for size alone. `agent-service.test.ts` (4,764 lines) and `web-chat-interface.test.ts` (3,969) are unwieldy, but a mechanical split changes no guarantee and invites merge churn; split them only when a phase already has them open.
- Acting on the static "never imported by a test" sweep beyond `ai-evaluation`'s CLI chain, which is the only entry that survived verification.
- Changing `interfaces/`' higher interaction-assertion rate. At 15.2% it is elevated but defensible for transport adapters, whose contract genuinely is which calls they make.

## Architecture decisions

### 1. Unrun tests are prevented by an executable guard, not a convention

Fixing the three current instances without a guard means the fourth arrives unnoticed, because the failure mode is silence. The guard is a test in `scripts/`, run in CI, that fails when a package with test files has no `test` script, when a `scripts/*.test.ts` is not reachable from a CI-run root script, or when a root `test:*` script points at a path that does not exist.

The third assertion is what catches the `test:integration` class of bug. Bun's path-substring filtering means a wrong path is indistinguishable from a narrow one at runtime, so the check must be on the script definition, not the exit code.

### 2. `satisfies`, not `as unknown as`, and not a cast on the literal

Replace `} as unknown as IEntityService` with `} satisfies IEntityService` on a fully populated literal, keeping the factory's declared return type unchanged.

This preserves the property the current design is protecting — zero casts in test files — while restoring compile-time drift detection at the single point where the mock is defined. `satisfies` is chosen over annotating the const because it keeps the literal's narrow inferred types available to `MockXReturns` consumers that read `.mock.calls`, which a widening annotation would erase.

Where a mock genuinely cannot satisfy the full interface, the escape is an explicit `Pick<IShell, ...>` or a documented partial type on the factory's return, not a cast. A narrower honest type is better than a wide dishonest one.

### 3. Test databases stay file-backed

libSQL `:memory:` is per-connection: two `createClient` calls against the same in-memory URL get two unrelated databases. Both the helpers and the services under test open multiple clients against one URL — `test-entity-db.ts` opens three, and `job-queue-service.ts` opens its own from the passed config. In-memory would silently give each of them an empty database.

The temp-file approach is therefore correct and stays. The per-test cost is real but small, and the alternative is not available without changing how services acquire connections.

### 4. The unified helper inverts the migration dependency

`@brains/test-utils` must not depend on `shell/entity-service`, `shell/job-queue`, or `shell/conversation-service` — that inverts the dependency direction and would create a cycle through the mocks. The shared helper therefore takes migration as an injected callback:

```ts
export interface TestDatabaseOptions {
  /** Temp directory prefix, e.g. "brain-entity-test-" */
  prefix: string;
  /** Database filename within the temp directory, e.g. "test-entities.db" */
  filename: string;
  /** Runs against the resolved file: URL before the handle is returned. */
  migrate: (url: string) => Promise<void>;
}

export interface TestDatabase {
  url: string;
  dbPath: string;
  dir: string;
  /** Register a client so cleanup closes it. Returns the client unchanged. */
  track: <T extends { close: () => void }>(client: T) => T;
  /** Closes every tracked client, then removes the temp directory. */
  cleanup: () => Promise<void>;
}
```

`track` is what makes one cleanup contract possible across four call sites with different connection counts. Each package keeps a thin local wrapper that supplies its own `prefix`, `filename`, and `migrate`, so per-package call sites change shape as little as possible.

### 5. `@brains/test-utils` is the only home for mock factories

A local `createMockX` is allowed only when no shared factory of that name exists. When a test needs behavior the shared factory lacks, the behavior goes into the shared factory's options — the existing `MockEntityServiceOptions` / `*Impl` override pattern already supports this, and all four local redefinitions are expressible through it.

`@brains/plugins/test` keeps `harness.ts` and `temp-dir.ts` and loses `mock-shell.ts`.

### 6. Evaluation CLI tests inject a fake evaluation core

Phase 4 tests composition — model fan-out, reporter selection, environment bootstrap, exit codes — not evaluation behavior, which `evaluation-service.test.ts` already covers. Tests inject a fake `EvaluationService` (or fixture `EvaluationSummary` values) so no phase adds a live model call, network dependency, or API key requirement to the default suite.

### 7. Tests wait on conditions, not on the clock

A shared `waitUntil(predicate, options)` helper goes into `@brains/test-utils`, implemented as recursive polling with a deadline — no counted loops, matching the codebase's functional-iteration idiom. Synchronization sleeps migrate to it; where the awaited completion already has an observable signal (a job completion event, a promise), tests await that signal directly instead of polling at all.

Fake timers (`jest.useFakeTimers` / `advanceTimersByTime`, supported in Bun 1.3) are reserved for the tests where elapsed time **is** the semantics — debounce, file-logger flush intervals. They are not used to paper over missing synchronization, because advancing a fake clock past a race does not prove the race is handled.

An ESLint `no-restricted-syntax` rule bans the `new Promise(... setTimeout ...)` sleep idiom in test files once migration lands, so the pattern cannot quietly return.

## Remaining implementation phases

Each phase is independently shippable and starts with its test. Phases 4 and 5 may be reordered against each other; Phase 6 comes last.

### Phase 4 — The evaluation CLI chain is under test

1. Write tests for `evaluation-runner` first, with a fake `EvaluationService` injected per decision 6: reporter selection, summary pass-through, and that a failing summary is not swallowed. Aggregation and partial-failure behavior are **not** re-tested here — `evaluation-service.test.ts` owns them.
2. Test `single-model-runner` and `multi-model-runner`: per-model result shape, and that one model's failure does not abort the others.
3. Test `json-reporter` and `console-reporter` against fixture `EvaluationSummary` values — output shape, not formatting whitespace. The three already-tested reporters (`markdown`, `comparison`, `model-comparison`) are the pattern to follow.
4. Test `run-evaluations` as the composition point, and `load-eval-env` / `cli-bootstrap` / `cli-help`: argument-to-mode mapping, environment bootstrap failure, help output, and that a failed evaluation exits nonzero.

Gate:

- Every module in the `run-evaluations` → reporters chain is reachable from a test.
- No test in the default suite makes a live model call or requires an API key.
- A deliberately failing evaluation produces a nonzero exit code.
- No existing `evaluation-service.test.ts` assertion is duplicated at the CLI layer.

### Phase 5 — Tests wait on conditions, not the clock

1. Write `waitUntil`'s own tests in `shared/test-utils`: resolves when the predicate turns true, rejects with the predicate's description at the deadline, never busy-loops.
2. Implement `waitUntil` per decision 7.
3. Migrate `plugins/directory-sync` first — it has the largest concentration of synchronization sleeps (21) and the most to gain: `sync-job-race-condition.test.ts`'s 100ms "wait for jobs" sleeps become waits on the job-completion signal they were approximating.
4. Migrate `shell/job-queue` (17), `interfaces/a2a` (12), `interfaces/chat` (10), and `shell/ai-service` (13 `delay()` calls in `agent-service.test.ts`) the same way, preferring a direct await on an observable completion over polling wherever one exists.
5. While `agent-service.test.ts` is open: replace its `Reflect.get` probes of the private conversation-actor registry with a package-internal introspection accessor on `AgentService` (actor count and snapshot). The probes already guard against shape drift at runtime; an accessor moves that guarantee to compile time and stops a private-field rename from silently breaking lifecycle assertions.
6. Convert the time-semantics family — `shared/utils` `debounce.test.ts` and `logger-file.test.ts` — to fake timers.
7. Replace the hardcoded `14010`/`14020` in `public-authoring-phase5-packed.test.ts` with `port: 0` and read back the assigned port, matching what `import-burst-stability.test.ts` already does.
8. Route the inline `mkdtemp` call sites that never clean up through `createTestDirectory`, starting with the three biggest sources — `plugins/cms`, `plugins/playbooks` and `packages/brains-ops` — which between them left over seventy thousand directories in `/tmp`.
9. Make the packed-authoring tests pack into a directory they own and delete, so bun does not stage 113M per run into `/tmp` and leave it there when an install is interrupted.
10. Land the ESLint `no-restricted-syntax` ban on the sleep idiom in test files, with `waitUntil` and fake timers as the documented alternatives.

Gate:

- No fixed-duration sleep used as synchronization remains in the migrated packages.
- No test binds a hardcoded port; two suites can run concurrently without EADDRINUSE.
- `directory-sync`'s suite time drops measurably (it is 25.4s today).
- Debounce and logger tests pass with fake timers and no real-time dependence.
- No test reads private service state via `Reflect.get`.
- A full suite run leaves no directory behind in the system temp dir.
- The ESLint rule fails on a reintroduced sleep.

### Phase 6 — No unsafe casts in test files

Builds on Phase 1 (shared mocks are `satisfies`-checked) and Phase 3 (shared factories are canonical), which together make this phase mechanical.

1. Migrate the 80 cast-bearing test files layer by layer, smallest layer first (`packages` 2 files, `shared` 2, `entities` 7, `interfaces` 10, `plugins` 18, `shell` 41). For each cast: if a shared factory exists for the type, use it; otherwise give the inline mock an honest narrow type (`Pick<...>` or a local interface) and adjust the code under test's parameter type if it demands more than it uses.
2. Where a cast survives because the type genuinely cannot be narrowed or faked honestly, move the construction into `@brains/test-utils` behind a `satisfies`-checked factory so the debt is centralized and visible, never inline.
3. Extend the Phase 1 ESLint restriction on `as unknown as` from `shared/test-utils/src/` to all `*.test.ts` / `*.test.tsx` files, enabled per layer as each layer completes.
4. Bring root-level `scripts/` under ESLint. `scripts/lint.mjs` drives turbo, which only visits workspace packages, so nothing lints the repository root today — including the Phase 0 guard tests. Without this, the rules above silently skip the one directory whose tests protect all the others.

Gate:

- Zero `as unknown as` in test files repo-wide.
- The ESLint restriction covers every test file and fails on a reintroduced cast.
- `scripts/` is linted by a CI-invoked command.
- No mock behavior changed — this phase only moves and types constructions.

## Validation matrix

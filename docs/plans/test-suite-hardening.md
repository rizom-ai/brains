# Plan: Test suite hardening

## Status

**Proposed — 2026-08-09; claims re-verified against code the same day.** Nothing in this plan is implemented. This is not a rescue plan: the suite is green and structurally healthy today. Every phase targets a drift mechanism or a dead spot rather than failing behavior, so no phase gates a release. Phases are independently shippable and ordered so each one makes the next safer.

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

1. `bun run test` runs 99 turbo tasks green in ~27s wall clock (45 cached). Shell alone is 17 packages in ~13s.
2. There are zero `.skip`, `.only`, and `.todo` markers across every workspace.
3. Weak assertions (`toBeDefined`, `toBeTruthy`, `toBeFalsy`, `toBeUndefined`, `toBeNull`, bare `not.toThrow`) are 6–10% of all `expect()` calls per layer — 8.7% in `shell/`, 10.4% in `shared/`, 2.7% in `packages/`.
4. Interaction assertions (`toHaveBeenCalled*`) are 7.3% of expects in `shell/` and 1.7% in `shared/`. Tests assert outcomes, not call logs. `interfaces/` is the outlier at 15.2%.
5. No test file is assertion-free.
6. `mock.module` appears 15 times repo-wide, almost always against genuinely external dependencies (`ai`, `@ai-sdk/*`, `@chat-adapter/*`, the npm `chat` package). One exception: `packages/brain-cli/test/remote-operate.test.ts` mocks its own `../src/lib/mcp-client` source module — Phase 3 removes it.
7. Test names are behavioral, not structural — `fails closed to public visibility and allows explicit scope widening`, `skips a stale update when the expected content hash changed`.
8. Initialization, registration, and shutdown paths required by `shell/AGENTS.md` are covered: `shell-shutdown.test.ts`, `shell-initialization-order.test.ts`, `service-ownership-integration.test.ts`, plus shutdown drained across four more `core` tests.

Two test-infrastructure homes exist and the split is correct: `@brains/test-utils` (mock factories, 297 consumers) and `@brains/plugins/test` (plugin harness, 144 consumers). This plan keeps both.

Two caveats to the baseline. Test files themselves contain 156 `as unknown as` casts across 80 files (94 in `shell/` alone), almost always on inline partial mocks — so the "no casts in test files" property that `test-utils`' header aims for does not hold today; Phase 6 addresses it. And `shell/ai-service/test/agent-service.test.ts` is the one file in the repo that reads private service state via `Reflect.get` (the conversation-actor registry probes); Phase 5 replaces those probes while it has the file open.

A static "modules never imported by a test" sweep flagged 25 of 53 modules in `shell/core`. That signal was checked and is mostly transitive-coverage noise — barrel modules such as `messageBus.ts` pull in their collaborators, and the init/shutdown paths it flagged are covered. Only `shell/ai-evaluation` survived the check as a genuine hole. This plan does not act on that sweep beyond Phase 4.

## Problems to solve

### Tests that exist but never execute

Three independent instances, none of which fail loudly:

- `sites/professional` has `test/professional-profile-schema.test.ts` and `test/template-schemas.test.ts`, and a `package.json` declaring only `lint`, `lint:fix`, and `typecheck`. Turbo's `test` task skips the package. It is the only package in the repo with test files and no `test` script.
- `scripts/build-roadmap-visual.test.ts` is run by nothing. Root `arch:test` is pinned to `bun test scripts/architecture-check.test.ts`, and `architecture-ci.yml` runs only that. Turbo does not traverse the root package.
- `test:integration` is `bun test test/integration`, and `test/integration` does not exist. Bun treats the argument as a path substring filter rather than erroring, so it matches `plugins/analytics/test/integration.test.ts`, runs 11 unrelated tests, and exits 0. `test:all` therefore reports a passing integration suite that was never written.

The common failure is that all three are silent. Nothing in CI distinguishes "ran and passed" from "matched nothing and passed."

### Mock drift cannot be caught by the type system

`@brains/test-utils` factories declare honest return types — `createMockEntityService(...): IEntityService` — but build the object literal and apply `as unknown as IEntityService` to it. There are 27 such casts across 13 mock files, 9 of them in the 1096-line `mock-shell.ts`.

The centralization is deliberate and good for consumers: the package header states the cast lives in the factory so test files need none. The problem is the cast's position. Applied to the literal, it erases the only check that would notice the interface moving:

- an interface gains a method, the mock literal does not → typecheck passes → suite passes
- no test calls the new method → the mock is silently stale, and every test using it now asserts against a shape the real service no longer has
- a test does call it → `undefined is not a function`, surfaced far from the cause

The same applies to signature changes on existing methods, which is the more common case and produces no runtime error at all — just a mock that accepts arguments the real service would reject.

### Four test-database helpers with divergent cleanup contracts

`shell/core/test/helpers/test-db.ts`, `shell/entity-service/test/helpers/test-entity-db.ts`, `shell/conversation-service/test/helpers/test-conversation-db.ts`, and `shell/job-queue/test/helpers/test-job-queue-db.ts` each implement the same flow: `mkdtemp` → build a `file:` URL → run migrations → return a `cleanup`. They disagree on what cleanup means:

- `conversation-service` closes the client it opened inside `cleanup`, then removes the directory. Correct.
- `entity-service` closes each of its three clients inline at the point of use; its `cleanup` only removes the directory. Also correct — a second valid contract.
- `job-queue` calls `createJobQueueDatabase(config)` inside `cleanup` to obtain a **new** client, closes that one, then removes the directory. The connection it closes was created two lines earlier for that purpose; the client the service under test opened is untouched. The line does nothing. This is the one defective implementation.
- `core` is temp-directory only, with no database concern.

Four implementations of one flow is well past the point where the abstraction should exist, and the two-valid-contracts split is exactly how the third, broken one arose: with no single place stating who closes what, `job-queue` guessed.

### Shared mocks re-implemented locally

`createMockEntityService` exists in `@brains/test-utils` and is independently redefined in four test files: `shell/entity-service/test/embeddingJobHandler.test.ts`, `shell/entity-service/test/singleton-entity-service.test.ts`, `plugins/stock-photo/test/tools.test.ts`, and `interfaces/a2a/test/client-resolution.test.ts`. `stock-photo` already depends on `@brains/test-utils` and reimplements anyway; `entity-service` and `a2a` do not declare the dependency. The same pattern appears for `createMockContext` (3 local definitions), `createPipelineContext` (4), and `createMockShell` (2).

Separately, `shell/plugins/src/test/mock-shell.ts` is a 12-line `@deprecated` shim re-exporting `createMockShell` from `@brains/test-utils`. The migration it bridged is complete.

Every local redefinition is a mock that will not be updated when the interface moves, which compounds the drift problem above.

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

## Phases

Each phase is independently shippable and starts with its test. Phases 1–5 may be reordered against each other, but Phase 0 goes first: it is the only one that changes whether the other phases' tests are believed. Phase 6 builds on Phases 1 and 3 and comes after both.

### Phase 0 — A test file that exists always runs

Walking skeleton. Delivers the guard and the three fixes it catches, end to end.

1. Write `scripts/test-wiring.test.ts`, failing on the current tree, asserting:
   - every workspace package containing a `*.test.ts` or `*.test.tsx` file declares a `test` script;
   - every `scripts/*.test.ts` file is matched by a root script that CI executes;
   - every root `test:*` script's path argument resolves to an existing file or directory.
2. Broaden `arch:test` to `bun test scripts/` so all script-level tests run, and keep the `architecture-ci.yml` step pointed at it. This makes `build-roadmap-visual.test.ts` execute for the first time; fix it if it fails.
3. Add `"test": "bun test"` to `sites/professional/package.json` and fix whatever its two test files surface.
4. Delete `test:integration` and `test:all`. There is no integration suite, `turbo run test` already covers every workspace, and a script that green-lights a suite that does not exist is worse than its absence. `test:unit` stays as an alias for `test`.
5. Add the guard test to `architecture-ci.yml` if step 2's broadening does not already cover it.

Gate:

- `scripts/test-wiring.test.ts` fails when a `test` script is removed from any package that has test files.
- `sites/professional` tests execute under `bun run test` and appear in turbo's task count.
- `scripts/build-roadmap-visual.test.ts` executes in CI.
- No root script references a nonexistent path.
- Turbo task count increases by at least one and the suite stays green.

### Phase 1 — Mock drift is a compile error

1. Convert `shared/test-utils/src/mock-entity-service.ts` first, as the proof: populate the literal fully and replace `as unknown as IEntityService` with `satisfies IEntityService`.
2. Verify the mechanism catches drift before converting anything else — add a method to `IEntityService` locally, confirm `bun run typecheck` fails at the mock, and revert. This step is manual verification of the guard, not a committed test; the compile error _is_ the assertion.
3. Convert the remaining 11 mock files, smallest first. Where a mock cannot satisfy its full interface, narrow the factory's declared return type per decision 2 rather than restoring the cast.
4. Convert `mock-shell.ts` last. At 1096 lines and 9 casts it is the hard case and the one with the most drift surface; doing it after the pattern is proven on 12 smaller files keeps the difficult work mechanical.
5. Add an ESLint rule or a `test-wiring` assertion forbidding `as unknown as` in `shared/test-utils/src/`, so the pattern cannot return.

Gate:

- Zero `as unknown as` casts remain in `shared/test-utils/src/`.
- Adding a method to `IShell` or `IEntityService` fails `bun run typecheck` at the mock definition.
- No test file gains a cast as a result of the conversion.
- Full suite green.

### Phase 2 — One test-database helper

1. Write the helper's own tests in `shared/test-utils`: `track` closes every registered client, `cleanup` removes the directory, `cleanup` is idempotent, and a failing `migrate` still removes the directory.
2. Implement `createTestDatabase` per decision 4.
3. Migrate `job-queue` first — it is the smallest and has the incorrect cleanup, so it is the migration that fixes a real defect. Its throwaway-connection line disappears.
4. Migrate `conversation-service` (already correct — proves the helper covers correct behavior without regressing it), then `entity-service` (three clients — proves `track` handles the multi-connection case), then `core` (temp directory only, no `migrate`).
5. Delete the four local helper implementations, leaving thin per-package wrappers.

Gate:

- One implementation of the mkdtemp → migrate → cleanup flow exists.
- All four packages' tests pass unchanged in behavior.
- No `cleanup` opens a connection.
- Temp directories are removed even when `migrate` throws.

### Phase 3 — One definition per mock

1. Extend `MockEntityServiceOptions` to cover what the four local `createMockEntityService` definitions need, with a test per added option.
2. Add `@brains/test-utils` as a devDependency to `shell/entity-service` and `interfaces/a2a`.
3. Replace the four local `createMockEntityService` definitions with the shared factory.
4. Repeat for `createMockShell` (2 local), `createMockContext` (3), and `createPipelineContext` (4), folding divergent needs into shared options.
5. Delete `shell/plugins/src/test/mock-shell.ts` and repoint its importers at `@brains/test-utils`.
6. Replace the `mock.module("../src/lib/mcp-client", ...)` in `packages/brain-cli/test/remote-operate.test.ts` with injection — `mock.module` against own source is the antipattern the rest of the repo already avoids; the client is internal code and its consumer should take it as a parameter.
7. Add a `test-wiring` assertion that fails when a test file defines a factory whose name matches a `@brains/test-utils` export.

Gate:

- `createMockEntityService`, `createMockShell`, `createMockContext`, and `createPipelineContext` each have exactly one definition.
- No `@deprecated` re-export shims remain under `shell/plugins/src/test/`.
- No `mock.module` targets a workspace-internal module.
- The guard fails when a shadowing local factory is reintroduced.

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
7. Land the ESLint `no-restricted-syntax` ban on the sleep idiom in test files, with `waitUntil` and fake timers as the documented alternatives.

Gate:

- No fixed-duration sleep used as synchronization remains in the migrated packages.
- `directory-sync`'s suite time drops measurably (it is 25.4s today).
- Debounce and logger tests pass with fake timers and no real-time dependence.
- No test reads private service state via `Reflect.get`.
- The ESLint rule fails on a reintroduced sleep.

### Phase 6 — No unsafe casts in test files

Builds on Phase 1 (shared mocks are `satisfies`-checked) and Phase 3 (shared factories are canonical), which together make this phase mechanical.

1. Migrate the 80 cast-bearing test files layer by layer, smallest layer first (`packages` 2 files, `shared` 2, `entities` 7, `interfaces` 10, `plugins` 18, `shell` 41). For each cast: if a shared factory exists for the type, use it; otherwise give the inline mock an honest narrow type (`Pick<...>` or a local interface) and adjust the code under test's parameter type if it demands more than it uses.
2. Where a cast survives because the type genuinely cannot be narrowed or faked honestly, move the construction into `@brains/test-utils` behind a `satisfies`-checked factory so the debt is centralized and visible, never inline.
3. Extend the Phase 1 ESLint restriction on `as unknown as` from `shared/test-utils/src/` to all `*.test.ts` / `*.test.tsx` files, enabled per layer as each layer completes.

Gate:

- Zero `as unknown as` in test files repo-wide.
- The ESLint restriction covers every test file and fails on a reintroduced cast.
- No mock behavior changed — this phase only moves and types constructions.

## Validation matrix

### Wiring

- package with test files and no `test` script;
- `scripts/*.test.ts` not reachable from a CI-run root script;
- root script pointing at a nonexistent path;
- turbo task count before and after Phase 0.

### Mock typing

- interface gains a method → typecheck fails at the mock;
- interface method changes signature → typecheck fails at the mock;
- mock retains narrow inferred types for `.mock.calls` consumers;
- no test file requires a cast.

### Test databases

- multi-client cleanup closes every tracked client;
- cleanup after a failed migration still removes the directory;
- idempotent cleanup;
- all four migrated packages behaviorally unchanged.

### Mock uniqueness

- shared factory covers every behavior the deleted local factories provided;
- reintroducing a shadowing local factory fails the guard.

### Evaluation CLI

- reporter selection and summary pass-through with a fake evaluation core;
- one model failing among several;
- `json` and `console` reporter output against fixtures;
- CLI exit codes and environment-bootstrap failure.

### Waiting

- `waitUntil` deadline, resolution, and rejection message;
- migrated race-condition tests pass under load (repeat-run locally before merging);
- fake-timer debounce and logger tests with no real-time dependence;
- ESLint rule catches the sleep idiom.

### Cast removal

- per-layer zero-cast check as each layer completes;
- surviving hard cases centralized in `@brains/test-utils` behind `satisfies`-checked factories;
- ESLint restriction catches a reintroduced cast in any test file.

## Risks and mitigations

- **Phase 0 turns previously-invisible failures into red CI.** That is the intended outcome, and the reason Phase 0 is first. `sites/professional`'s two tests and `build-roadmap-visual.test.ts` have never run and may not pass. Fix them in Phase 0 rather than merging the guard with exclusions; an allowlist would reproduce the problem the guard exists to remove.
- **Phase 1 surfaces mocks that are already stale.** Likely in `mock-shell.ts`, and the reason it is sequenced last within the phase. A revealed gap means tests were asserting against a shape the real service no longer has, so fix the mock and re-check the tests that used it rather than narrowing the type to make the error disappear.
- **`satisfies` on a large literal produces hard-to-read errors.** Convert one file at a time and keep each conversion a separate commit, so a confusing error is always attributable to one mock.
- **Phase 2's `track` is easy to forget at a call site.** The four in-tree call sites are migrated in the same phase. Beyond that, an untracked client is no worse than today's behavior, so the helper degrades to the current state rather than to something broken.
- **Phase 3 changes shared mock defaults and breaks distant tests.** Fold local behavior in as opt-in options with defaults matching current shared behavior; never change an existing default to accommodate a migrating call site.
- **Phase 4 tempts real model calls for realism.** Injected fake evaluation core only. If a live-model evaluation test is ever wanted, it belongs behind an explicit opt-in script, not in the default suite.
- **Phase 4 re-tests what `evaluation-service.test.ts` already covers.** The CLI tests assert composition, not evaluation semantics; the gate forbids duplicating existing assertions. Duplicated coverage is not free — it doubles the cost of every future orchestration change.
- **Phase 5 replaces a sleep with a wait on the wrong condition and hides a real race.** Each migration states what the original sleep was waiting for; when that cannot be named, the sleep is flagging an untestable design, and the right fix is exposing a completion signal from the code under test, not a longer poll.
- **Fake timers mask genuine asynchrony.** Decision 7 restricts them to tests where elapsed time is the behavior under test; synchronization always goes through `waitUntil` or a direct await.
- **Phase 6 widens parameter types in production code to accommodate tests.** Narrowing a consumer's parameter from a service interface to the methods it uses is a legitimate improvement; loosening a type to `Partial` or `unknown` to make a mock fit is not. When an honest type cannot be found, the cast moves into a centralized factory rather than being disguised.
- **The guard tests become the thing people work around.** All the guards fail loudly with the offending path named. If a guard needs an exception, that is a signal to revisit the rule, not to add a skip — the repo currently has zero skips and that property is worth keeping.

## Success criteria

- No test file in the repository is unreachable from CI.
- No root script silently matches nothing.
- Adding a method to a mocked interface fails typecheck rather than passing silently.
- No `as unknown as` remains in `shared/test-utils/src/` or in any test file.
- One implementation of test-database setup, with one cleanup contract, and no cleanup that opens a connection.
- Each shared mock factory has exactly one definition.
- `shell/ai-evaluation`'s CLI chain is reachable from tests, with no live model calls in the default suite.
- No test synchronizes on a fixed-duration sleep, and no `mock.module` targets workspace-internal code.
- The baseline properties hold: zero skips, weak assertions under 10% per layer, suite under 60s.

## Related plans

- [`docs/plans/README.md`](./README.md) — this plan is deleted once its phases ship; git history is the archive
- [`shell/AGENTS.md`](../../shell/AGENTS.md) — the init/registration/shutdown testing requirement this plan verifies is already met

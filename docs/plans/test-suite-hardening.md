# Plan: Test suite hardening

## Status

**Proposed — 2026-08-09; claims re-verified against code the same day, then independently re-checked by executing them.** This is not a rescue plan: the suite is green and structurally healthy today. Every phase targets a drift mechanism or a dead spot rather than failing behavior, so no phase gates a release. Phases are independently shippable and ordered so each one makes the next safer.

Phase 3 step 6 (the `brain-cli` `mock.module`) landed on 2026-08-09, ahead of its phase, because it was self-contained and blocked nothing. Everything else is unimplemented.

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
2. There are zero unconditional `.skip`, `.only`, and `.todo` markers across every workspace. One conditional skip exists — `it.skipIf(!RUN_SOAK)` in `packages/brain-cli/test/import-burst-stability.test.ts:299`, an opt-in soak test gated on `RUN_IMPORT_BURST_SOAK=1`. That is the shape an opt-in test should take, and Phase 4 cites it as precedent rather than treating it as a violation.
3. Weak assertions (`toBeDefined`, `toBeTruthy`, `toBeFalsy`, `toBeUndefined`, `toBeNull`, bare `not.toThrow`) are 6–10% of all `expect()` calls per layer — 8.7% in `shell/`, 10.4% in `shared/`, 2.7% in `packages/`.
4. Interaction assertions (`toHaveBeenCalled*`) are 7.3% of expects in `shell/` and 1.7% in `shared/`. Tests assert outcomes, not call logs. `interfaces/` is the outlier at 15.2%.
5. No test file is assertion-free.
6. `mock.module` is 9 real calls repo-wide — 4 in `shell/ai-service/test/aiService.test.ts` (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) and 4 in `interfaces/chat/test/harness/chat-interface-harness.ts` (`chat`, `@chat-adapter/*`), all genuinely external. The 9th, `packages/brain-cli/test/remote-operate.test.ts` mocking its own `../src/lib/mcp-client`, was the single internal violation and is now fixed (Phase 3 step 6). A further 6 textual occurrences are comments, and those comments already state the rule this plan enforces — `chat-interface-harness.ts:419` reserves `mock.module` "for the genuinely external chat SDK."
7. Test names are behavioral, not structural — `fails closed to public visibility and allows explicit scope widening`, `skips a stale update when the expected content hash changed`.
8. Initialization, registration, and shutdown paths required by `shell/AGENTS.md` are covered: `shell-shutdown.test.ts`, `shell-initialization-order.test.ts`, `service-ownership-integration.test.ts`, plus shutdown drained across four more `core` tests.

Two test-infrastructure homes exist and the split is correct: `@brains/test-utils` (mock factories, 296 consumers) and `@brains/plugins/test` (plugin harness, 144 consumers). This plan keeps both.

Two caveats to the baseline. Test files themselves contain 157 `as unknown as` casts across 81 files (94 in `shell/` alone), almost always on inline partial mocks — so the "no casts in test files" property that `test-utils`' header aims for does not hold today; Phase 6 addresses it. And `shell/ai-service/test/agent-service.test.ts` is the one file in the repo that reads private service state via `Reflect.get` (the conversation-actor registry probes); Phase 5 replaces those probes while it has the file open.

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

Those 27 are not one population. Three kinds are mixed together, and only the first is what `satisfies` fixes:

- **top-level literal casts** — the factory's own return object, e.g. `mock-entity-service.ts`. This is the drift-prone majority and the case decision 2 addresses directly.
- **nested sub-mock casts** — an inline partial returned from an `IShell` method: `mock-shell.ts:788` (`IJobQueueService`), `:798` (`RenderService`), `:814` (`IMCPTransport`), plus `:312` (`MessageBus`), `:609` (`ContentService`), `:628` (`DataSourceRegistry`). These are equally drift-prone but cannot be narrowed away, because the return type is fixed by `IShell`'s own signature — `getJobQueueService(): IJobQueueService` is not the factory's to narrow.
- **generic-variance casts on a variable** — `mock-shell.ts:506` and `:528`, both on the heterogeneous `entityAdapters` map (`adapter as unknown as EntityAdapter<BaseEntity>`). There is no literal for `satisfies` to attach to, and the cast is a legitimate consequence of storing adapters of different entity types in one map.

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

`createMockEntityService` exists in `@brains/test-utils` and is independently redefined in **five** test files: `shell/entity-service/test/embeddingJobHandler.test.ts`, `shell/entity-service/test/singleton-entity-service.test.ts`, `plugins/stock-photo/test/tools.test.ts`, `interfaces/a2a/test/client-resolution.test.ts`, and `entities/social-media/test/handlers/publishExecuteHandler.test.ts` (which returns a locally-declared `TestEntityService` type). `stock-photo` already depends on `@brains/test-utils` and reimplements anyway; `entity-service` and `a2a` do not declare the dependency. `createMockShell` has 2 local definitions (`shell/app/test/app.test.ts`, returning `ShellInstance`, and `plugins/atproto/test/publishing-triggers.test.ts`).

The other two are a different problem wearing the same clothes, and the distinction changes what fixes them:

- `createMockContext` has **4** local definitions (`shell/plugins/test/service/create-entity-with-unique-title.test.ts`, `plugins/directory-sync/test/git/setup-initial-sync-git.test.ts`, `plugins/site-builder/test/unit/auto-rebuild.test.ts`, `entities/portfolio/test/handlers.test.ts`) but **shadows nothing** — `@brains/test-utils` exports no `createMockContext`. The nearest shared factories are `createMockServicePluginContext` and `createMockEntityPluginContext`, under different names. These four duplicate each other, not a shared original.
- `createPipelineContext` has 4 definitions, **all four inside `plugins/site-builder/test/unit/`**, all building `BuildPipelineContext` — a type owned by site-builder. There is no shared original and there should not be one.

Every local redefinition of a genuinely shared factory is a mock that will not be updated when the interface moves, which compounds the drift problem above. The `createMockContext` / `createPipelineContext` duplicates are cheaper — they drift only against their own package — but four copies of one helper in one directory is still four places to edit.

Separately, `shell/plugins/src/test/mock-shell.ts` is a 12-line `@deprecated` shim re-exporting `createMockShell` from `@brains/test-utils`. The migration it bridged is complete.

Every local redefinition is a mock that will not be updated when the interface moves, which compounds the drift problem above.

### The evaluation CLI chain is untested

`shell/ai-evaluation`'s core orchestration is covered: `evaluation-service.test.ts` drives `EvaluationService.runEvaluations` end-to-end with injected chat mocks, which exercises `PluginRunner`, `TestRunner`, the judges, aggregation, and partial-failure handling. `cli-options`, `eval-config-loader`, `eval-db-builder`, and three of five reporters (`markdown`, `comparison`, `model-comparison`) also have direct tests.

What has no coverage by any route is the CLI composition layer that wraps that tested core:

`run-evaluations` → `evaluation-runner` → `single-model-runner` / `multi-model-runner`, plus `cli-bootstrap`, `cli-help`, `load-eval-env`, and the `json-reporter` / `console-reporter` pair.

No test imports any of these, directly or transitively. Model fan-out, reporter selection, environment bootstrap, and exit-code behavior — the parts a CI eval run actually depends on — are the unverified parts.

One test does reach two of these modules, but not by importing them. `test/eval-settle.test.ts:76-100` reads `single-model-runner.ts` and `multi-model-runner.ts` as **source text** and asserts on the character offsets of `hasPrebuiltEvalDatabase(`, `bootEvalApp(`, and `waitForJobsToDrain(` to pin their call ordering. It is a real guarantee expressed the only way it could be without injectable runners — and it will break the moment Phase 4 makes them injectable, with a failure message that compares two integers. Phase 4 owns replacing it.

### Fixed-duration sleeps as synchronization

Tests contain roughly 100 fixed sleeps on a strict `setTimeout(resolve|r, N)` count, more once `delay()` helpers and `Bun.sleep` are included. The concentration is `shared/utils` (20), `shell/job-queue` (16), `plugins/directory-sync` (14), `interfaces/a2a` (11), and `interfaces/chat` (10). They split into two families:

- **Synchronization sleeps** — `setTimeout(resolve, 100) // Wait for jobs` in `sync-job-race-condition.test.ts` and siblings. These encode a guess about scheduler latency: too short is flaky under load, long enough to be safe is wasted wall clock on every run. `directory-sync` at 25.4s is the slowest package in the suite largely for this reason — note that it is third by sleep count but first by runtime, so runtime is what justifies migrating it first, not volume.
- **Time-semantics tests** — `debounce.test.ts` and `logger-file.test.ts`, where elapsed time is the behavior under test, currently driven by real 30–80ms timers.

No **generic** wait-for-condition helper exists, which is why the pattern keeps being written by hand. Three domain-specific waiters do exist and were each written to fill the gap locally: `waitForJobsToDrain` and `waitForIndexReadiness` (`shell/ai-evaluation/src/eval-settle.ts`) and `waitForImportJobs` (`plugins/directory-sync/src/lib/import-job-polling.ts`). Phase 5 reimplements those three on top of the shared helper rather than leaving a fourth polling idiom standing. Bun 1.3.11's test runner supports `jest.useFakeTimers` / `advanceTimersByTime` — verified by executing it, not by release notes — so the time-semantics family has a deterministic alternative too.

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

This preserves the property the current design is protecting — zero casts in test files — while restoring compile-time drift detection at the single point where the mock is defined. `satisfies` is chosen over annotating the const because it checks the literal without altering the factory's public type, so the conversion is local to one line and no consumer sees a signature change. (It is _not_ chosen to preserve narrow inferred types for `.mock.calls` consumers: the factories declare concrete return types like `IEntityService`, which erase the mock types at the function boundary regardless, and no caller in the repo reads `.mock.calls` off one of these results.)

The three cast kinds identified above get three different treatments, and only the first is a mechanical `satisfies` swap:

1. **Top-level literal** → `satisfies IEntityService`. The common case.
2. **Nested sub-mock behind a fixed `IShell` signature** → extract to its own `satisfies`-checked factory, do not inline-populate. `createMockJobQueueService` already exists in `@brains/test-utils` and `mock-shell.ts:788` reimplements a partial one inline; the fix is to call the existing factory. Same for the `RenderService`, `IMCPTransport`, `MessageBus`, `ContentService`, and `DataSourceRegistry` sub-mocks, each of which gets a factory if it lacks one. Narrowing the return type is not available here — the signature belongs to `IShell`.
3. **Generic-variance cast on a heterogeneous map** (`mock-shell.ts:506`, `:528`) → keep, with a comment naming why. A map holding adapters for many entity types cannot be typed without one, and `satisfies` has no literal to attach to.

Because case 3 survives, the Phase 1 gate is "zero `as unknown as` **on an object literal** in `shared/test-utils/src/`", not zero casts outright. A gate that forbids the two variance casts would be satisfied only by suppressing it or by redesigning the adapter map, neither of which is this plan's business.

Where a mock genuinely cannot satisfy the full interface _and_ the factory owns its own return type, the escape is an explicit `Pick<IShell, ...>` or a documented partial type on the return, not a cast. A narrower honest type is better than a wide dishonest one.

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

`track` only reaches clients opened where the handle is in scope, and one call site is not: `entity-service`'s three clients are split across two functions. `createTestEntityDatabase` opens one (`embClient`) and can track it, but the other two are opened inside `insertTestEntity(config, data, embeddingConfig)` — a separately exported helper that receives configs, never the handle, and closes inline at `:84` and `:96`. Phase 2 therefore changes `insertTestEntity` to take the `TestDatabase` handle instead of two configs. It is test-only code with in-package callers, and it is the only way "one cleanup contract" is literally true rather than true of the parts that happen to be in scope.

### 5. `@brains/test-utils` is the only home for mock factories — of cross-package interfaces

A local `createMockX` is allowed only when no shared factory for that _type_ exists. When a test needs behavior the shared factory lacks, the behavior goes into the shared factory's options — the existing `MockEntityServiceOptions` / `*Impl` override pattern already supports this, and all five local `createMockEntityService` redefinitions are expressible through it.

The rule is scoped by ownership, not by duplicate count. `@brains/test-utils` is for mocks of interfaces that cross package boundaries (`IEntityService`, `IShell`, `IJobQueueService`). A helper that builds a type **owned by one package** is consolidated inside that package, because moving it into `test-utils` would make the shared test package depend on a plugin's internals — the same inversion decision 4 refuses for migrations. Concretely: the four `createPipelineContext` copies build site-builder's `BuildPipelineContext` and consolidate into `plugins/site-builder/test/helpers/`, not into `test-utils`.

`createMockContext` is the third case: four copies that duplicate each other while shadowing nothing. Each is replaced by the shared factory for the context type it actually builds — `createMockServicePluginContext` or `createMockEntityPluginContext` — rather than by a new shared `createMockContext`.

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
2. Broaden `arch:test` to `bun test scripts/` so all script-level tests run, and keep the `architecture-ci.yml` step pointed at it. This makes `build-roadmap-visual.test.ts` execute for the first time. It was run manually during review and passes clean — 17 tests, 50ms — so this step is free.
3. Add `"test": "bun test"` to `sites/professional/package.json`. Its two files were run manually during review: 3 pass, 1 fail. The failure is real and is a schema bug, not a stale test — `professional-profile-schema.test.ts:27` expects `parsed["artistMediums"]` to be `["installation"]` and gets `undefined`, because the schema strips the field. Decide whether `artistMediums` belongs in the schema and fix in that direction; do not delete the assertion to go green.
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
4. Convert `mock-shell.ts` last. At 1096 lines and 9 casts it is the hard case and the one with the most drift surface; doing it after the pattern is proven on 12 smaller files keeps the difficult work mechanical. Only one of its nine casts is a plain top-level literal — treat the six nested sub-mocks as case 2 of decision 2 (extract to a factory; `createMockJobQueueService` already exists and is being reimplemented inline at `:788`), and leave `:506` / `:528` as case 3 with a comment.
5. Add an ESLint rule or a `test-wiring` assertion forbidding `as unknown as` **on an object literal** in `shared/test-utils/src/`, so the pattern cannot return. The rule must not fire on the two documented variance casts; if it cannot distinguish them syntactically, pin them with a targeted disable comment naming decision 2 case 3 rather than widening the rule's exemption to the whole file.

Gate:

- Zero `as unknown as` casts on object literals remain in `shared/test-utils/src/`; the only survivors are `mock-shell.ts:506` and `:528`, each carrying a comment naming why.
- `mock-shell.ts` no longer builds an inline partial `IJobQueueService` — it calls `createMockJobQueueService`.
- Adding a method to `IShell` or `IEntityService` fails `bun run typecheck` at the mock definition.
- No test file gains a cast as a result of the conversion.
- Full suite green.

### Phase 2 — One test-database helper

1. Write the helper's own tests in `shared/test-utils`: `track` closes every registered client, `cleanup` removes the directory, `cleanup` is idempotent, and a failing `migrate` still removes the directory.
2. Implement `createTestDatabase` per decision 4.
3. Migrate `job-queue` first — it is the smallest and has the incorrect cleanup, so it is the migration that fixes a real defect. Its throwaway-connection line disappears.
4. Migrate `conversation-service` (already correct — proves the helper covers correct behavior without regressing it), then `entity-service`, then `core` (temp directory only, no `migrate`).
5. `entity-service` is the multi-connection case and needs a signature change to actually be one: change `insertTestEntity(config, data, embeddingConfig)` to take the `TestDatabase` handle, per decision 4, so its two inline `client.close()` calls become tracked. Without this the helper only covers the one client the handle happens to see, and the "one cleanup contract" claim is false for the other two.
6. Delete the four local helper implementations, leaving thin per-package wrappers.

Gate:

- One implementation of the mkdtemp → migrate → cleanup flow exists.
- All four packages' tests pass unchanged in behavior.
- No `cleanup` opens a connection.
- No test-database client is closed outside `cleanup` — including the two in `insertTestEntity`.
- Temp directories are removed even when `migrate` throws.

### Phase 3 — One definition per mock

1. Extend `MockEntityServiceOptions` to cover what the five local `createMockEntityService` definitions need, with a test per added option.
2. Add `@brains/test-utils` as a devDependency to `shell/entity-service`, `interfaces/a2a`, and `entities/social-media`.
3. Replace all five local `createMockEntityService` definitions with the shared factory. `entities/social-media/test/handlers/publishExecuteHandler.test.ts` also declares its own `TestEntityService` type for the return; that goes too.
4. Repeat for `createMockShell` (2 local), noting that `shell/app/test/app.test.ts`'s version returns `ShellInstance` rather than `MockShell` — confirm the shared factory covers that call site before deleting it, and if it cannot, that is a real gap in `createMockShell`, not a reason to keep the local copy.
5. Replace the four `createMockContext` definitions with `createMockServicePluginContext` or `createMockEntityPluginContext` as the call site requires. Do **not** add a shared `createMockContext` — there is no such export today and the name spans two different context types.
6. Consolidate the four `createPipelineContext` copies into `plugins/site-builder/test/helpers/`, per decision 5. This one stays package-local; `BuildPipelineContext` is site-builder's type and `@brains/test-utils` must not learn about it.
7. Delete `shell/plugins/src/test/mock-shell.ts` and repoint its importers at `@brains/test-utils`. Consumers reach it through the `@brains/plugins/test` barrel (e.g. `shell/core/test/plugin-api-routes.test.ts:2`), so the barrel export goes at the same time.
8. ~~Replace the `mock.module("../src/lib/mcp-client", ...)` in `packages/brain-cli/test/remote-operate.test.ts` with injection.~~ **Done 2026-08-09.** `operateRemote` now takes a `RemoteToolClientFactory` as an optional last parameter, defaulting to a factory that keeps the lazy `await import("../lib/mcp-client")` inside itself so the MCP SDK stays off the CLI's startup path. The injected type is `RemoteToolClient`, a structural interface naming only the four methods the command calls, and the test's fake is `satisfies`-checked with no cast.
9. Add a `test-wiring` assertion that fails when a test file defines a local mock factory for a type that `@brains/test-utils` already provides a factory for. Match on the **type constructed**, not the function name: the four `createMockContext` copies shadow `createMockServicePluginContext` under a different name, so a name-collision check would have missed every one of them and would keep missing them after this phase.

Gate:

- `createMockEntityService` and `createMockShell` each have exactly one definition, in `@brains/test-utils`.
- `createMockContext` has zero definitions; its call sites use the two shared context factories.
- `createPipelineContext` has exactly one definition, inside `plugins/site-builder/test/helpers/`.
- No `@deprecated` re-export shims remain under `shell/plugins/src/test/`.
- No `mock.module` targets a workspace-internal module. **Already true as of 2026-08-09.**
- The guard fails when a local factory for an already-covered type is reintroduced under any name.

### Phase 4 — The evaluation CLI chain is under test

1. Write tests for `evaluation-runner` first, with a fake `EvaluationService` injected per decision 6: reporter selection, summary pass-through, and that a failing summary is not swallowed. Aggregation and partial-failure behavior are **not** re-tested here — `evaluation-service.test.ts` owns them.
2. Test `single-model-runner` and `multi-model-runner`: per-model result shape, and that one model's failure does not abort the others. Making these injectable will break `test/eval-settle.test.ts:76-100`, which asserts on the source text of both files. Delete that `describe` block **in the same commit** and carry its guarantee over as a behavioral assertion against the injected fake — that the prebuilt-database check runs before boot and the job drain runs after — expressed as an ordered call log. Leaving it in place means a passing refactor reports as an unexplained integer comparison failure; deleting it without replacement silently drops a real ordering guarantee.
3. Test `json-reporter` and `console-reporter` against fixture `EvaluationSummary` values — output shape, not formatting whitespace. The three already-tested reporters (`markdown`, `comparison`, `model-comparison`) are the pattern to follow.
4. Test `run-evaluations` as the composition point, and `load-eval-env` / `cli-bootstrap` / `cli-help`: argument-to-mode mapping, environment bootstrap failure, help output, and that a failed evaluation exits nonzero.

Gate:

- Every module in the `run-evaluations` → reporters chain is reachable from a test.
- No test in the default suite makes a live model call or requires an API key. If a live-model eval is ever wanted, it is gated the way `import-burst-stability.test.ts` gates its soak run — `it.skipIf(!FLAG)` on an explicit env var — not added to the default suite.
- A deliberately failing evaluation produces a nonzero exit code.
- No existing `evaluation-service.test.ts` assertion is duplicated at the CLI layer.
- No test asserts on the source text of a module under test; `eval-settle.test.ts`'s offset comparisons are gone and their guarantee is expressed behaviorally.

### Phase 5 — Tests wait on conditions, not the clock

1. Write `waitUntil`'s own tests in `shared/test-utils`: resolves when the predicate turns true, rejects with the predicate's description at the deadline, never busy-loops.
2. Implement `waitUntil` per decision 7.
3. Migrate `plugins/directory-sync` first — not because it has the most sleeps (it is third at 14, behind `shared/utils` at 20 and `shell/job-queue` at 16) but because at 25.4s it is the slowest package in the suite and has the most wall clock to reclaim. `sync-job-race-condition.test.ts`'s 100ms "wait for jobs" sleeps become waits on the job-completion signal they were approximating.
4. Migrate `shell/job-queue` (16), `interfaces/a2a` (11), `interfaces/chat` (10), and `shell/ai-service` (14 `delay()` calls in `agent-service.test.ts`) the same way, preferring a direct await on an observable completion over polling wherever one exists.
5. Reimplement the three existing domain waiters on top of `waitUntil` — `waitForJobsToDrain` and `waitForIndexReadiness` in `shell/ai-evaluation/src/eval-settle.ts`, and `waitForImportJobs` in `plugins/directory-sync/src/lib/import-job-polling.ts`. These are production modules, not tests, so this is the one step of the phase that changes shipped code; keep their signatures and behavior identical. Skipping it leaves the repo with a shared helper plus three hand-rolled polling loops, which is the state the phase exists to end.
6. While `agent-service.test.ts` is open: replace its five `Reflect.get` probes of the private conversation-actor registry (`shell/ai-service/test/agent-service.test.ts:74-116`) with a package-internal introspection accessor on `AgentService` (actor count and snapshot). The probes already guard against shape drift at runtime; an accessor moves that guarantee to compile time and stops a private-field rename from silently breaking lifecycle assertions.
7. Convert the time-semantics family — `shared/utils` `debounce.test.ts` and `logger-file.test.ts` — to fake timers.
8. Land the ESLint `no-restricted-syntax` ban on the sleep idiom in test files, with `waitUntil` and fake timers as the documented alternatives.

Gate:

- No fixed-duration sleep used as synchronization remains in the migrated packages.
- `directory-sync`'s suite time drops measurably (it is 25.4s today).
- Debounce and logger tests pass with fake timers and no real-time dependence.
- No test reads private service state via `Reflect.get`.
- No hand-rolled polling loop remains alongside `waitUntil`; the three domain waiters delegate to it.
- The ESLint rule fails on a reintroduced sleep.

### Phase 6 — No unsafe casts in test files

Builds on Phase 1 (shared mocks are `satisfies`-checked) and Phase 3 (shared factories are canonical), which together make this phase mechanical.

1. Migrate the 81 cast-bearing test files layer by layer, smallest layer first (`packages`, `shared`, `entities`, `interfaces`, `plugins`, then `shell` with 94 of the 157 casts). For each cast: if a shared factory exists for the type, use it; otherwise give the inline mock an honest narrow type (`Pick<...>` or a local interface) and adjust the code under test's parameter type if it demands more than it uses. `packages/brain-cli/test/remote-operate.test.ts` is the worked example — narrowing `MCPClient` to the four methods the command actually calls turned a module replacement into a `satisfies`-checked fake with no cast, and the narrow interface is what made the fake honest.
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
- a nested sub-mock behind a fixed `IShell` signature is drift-checked too, not just the top-level literal;
- the two documented variance casts are the only surviving casts, each with a comment;
- no test file requires a cast.

### Test databases

- multi-client cleanup closes every tracked client;
- cleanup after a failed migration still removes the directory;
- idempotent cleanup;
- all four migrated packages behaviorally unchanged.

### Mock uniqueness

- shared factory covers every behavior the deleted local factories provided;
- reintroducing a local factory for an already-covered type fails the guard **under a different name** — the `createMockContext` case, which a name-collision guard misses.

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

- **Phase 0 turns previously-invisible failures into red CI.** That is the intended outcome, and the reason Phase 0 is first. The size is now known rather than feared: `build-roadmap-visual.test.ts` passes as-is, and `sites/professional` has exactly one failure, in the profile schema. Fix it in Phase 0 rather than merging the guard with exclusions; an allowlist would reproduce the problem the guard exists to remove.
- **Phase 1 surfaces mocks that are already stale.** Likely in `mock-shell.ts`, and the reason it is sequenced last within the phase. A revealed gap means tests were asserting against a shape the real service no longer has, so fix the mock and re-check the tests that used it rather than narrowing the type to make the error disappear.
- **Phase 1's gate is read as "zero casts" and the two variance casts get bulldozed.** They are not drift risk; they are the price of a heterogeneous adapter map. Suppressing the rule at those two lines with a comment is correct, and redesigning the map to satisfy a lint rule is out of scope.
- **`satisfies` on a large literal produces hard-to-read errors.** Convert one file at a time and keep each conversion a separate commit, so a confusing error is always attributable to one mock.
- **Phase 2's `track` is easy to forget at a call site.** The four in-tree call sites are migrated in the same phase. Beyond that, an untracked client is no worse than today's behavior, so the helper degrades to the current state rather than to something broken. The specific trap is a client opened somewhere the handle is not in scope — `insertTestEntity` is that case today and step 5 fixes it by passing the handle; watch for the same shape elsewhere.
- **Phase 3 changes shared mock defaults and breaks distant tests.** Fold local behavior in as opt-in options with defaults matching current shared behavior; never change an existing default to accommodate a migrating call site.
- **Phase 3 pulls package-owned helpers into `@brains/test-utils` for symmetry.** Four copies of a helper is a smell regardless of where the type lives, but the fix location differs: cross-package interface → shared factory, package-owned type → package-local helper. `createPipelineContext` is the second kind and moving it shared would invert the dependency direction the plan protects everywhere else.
- **Phase 4 tempts real model calls for realism.** Injected fake evaluation core only. If a live-model evaluation test is ever wanted, it belongs behind an `it.skipIf(!FLAG)` env gate like the existing soak test, not in the default suite.
- **Phase 4 breaks a test it does not know exists.** `eval-settle.test.ts` asserts on the runners' source text, so it fails on any refactor of their internals with a message that names no cause. Step 2 deletes and replaces it deliberately; discovering it mid-phase invites "fix" by adjusting the expected offsets, which would re-pin the new implementation just as tightly.
- **Phase 4 re-tests what `evaluation-service.test.ts` already covers.** The CLI tests assert composition, not evaluation semantics; the gate forbids duplicating existing assertions. Duplicated coverage is not free — it doubles the cost of every future orchestration change.
- **Phase 5 replaces a sleep with a wait on the wrong condition and hides a real race.** Each migration states what the original sleep was waiting for; when that cannot be named, the sleep is flagging an untestable design, and the right fix is exposing a completion signal from the code under test, not a longer poll.
- **Fake timers mask genuine asynchrony.** Decision 7 restricts them to tests where elapsed time is the behavior under test; synchronization always goes through `waitUntil` or a direct await.
- **Phase 6 widens parameter types in production code to accommodate tests.** Narrowing a consumer's parameter from a service interface to the methods it uses is a legitimate improvement; loosening a type to `Partial` or `unknown` to make a mock fit is not. When an honest type cannot be found, the cast moves into a centralized factory rather than being disguised.
- **The guard tests become the thing people work around.** All the guards fail loudly with the offending path named. If a guard needs an exception, that is a signal to revisit the rule, not to add a skip — the repo has no unconditional skips and that property is worth keeping. An `it.skipIf(!ENV_FLAG)` opt-in for an expensive test is a different thing and stays allowed.

## Success criteria

- No test file in the repository is unreachable from CI.
- No root script silently matches nothing.
- Adding a method to a mocked interface fails typecheck rather than passing silently, including on sub-mocks nested inside `createMockShell`.
- No `as unknown as` on an object literal remains in `shared/test-utils/src/` or in any test file; the only survivors are the two documented variance casts in `mock-shell.ts`.
- One implementation of test-database setup, with one cleanup contract, no cleanup that opens a connection, and no client closed outside `cleanup`.
- Each shared mock factory has exactly one definition, and each package-owned test helper has exactly one definition inside its own package.
- `shell/ai-evaluation`'s CLI chain is reachable from tests, with no live model calls in the default suite and no assertions on module source text.
- No test synchronizes on a fixed-duration sleep, and no `mock.module` targets workspace-internal code (**already true**).
- The baseline properties hold: no unconditional skips, weak assertions under 10% per layer, suite under 60s.

## Related plans

- [`docs/plans/README.md`](./README.md) — this plan is deleted once its phases ship; git history is the archive
- [`shell/AGENTS.md`](../../shell/AGENTS.md) — the init/registration/shutdown testing requirement this plan verifies is already met

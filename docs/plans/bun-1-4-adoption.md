# Plan: Bun 1.4 adoption

## Status

**Implemented; pending review.** Phase 1 established the Bun 1.4 runtime.
Phases 2–6 are complete, with scope adjusted where measurement or repository
audit contradicted the original plan. Frozen install, full lint, typecheck,
test, architecture, and all six packed compatibility contracts pass under Bun
1.4. The console visual runner completes in the available Chromium container;
its committed baselines differ in that environment, while Sharp and `pngjs`
produce identical pixel-difference ratios for the same captures.

## Goal

Adopt the Bun 1.4 features that remove real code and real failure classes from
this repo, and explicitly decline the ones that only relocate working code.
Three concrete wins drive the plan:

1. **`Bun.Image` replaces `sharp`** — deletes the native-binary boot-crash
   class that `shared/site-engine/src/image-optimizer.ts:9-28` documents and
   works around with a lazy loader, and drops `sharp` from the published
   `@rizom/brain` dependency set.
2. **`bun test --parallel` inside the biggest packages** — turbo parallelizes
   across packages, but directory-sync (102 test files), brain-cli (72) and
   shell/core (49) each run sequentially inside one process and sit on the CI
   critical path.
3. **Complete fake timers (`Date` interception + `setSystemTime` /
   `advanceTimersByTime` interop)** — 45 test files still synchronize with
   fixed real sleeps, a problem `shared/test-utils/src/wait-until.ts` already
   documents. Date control is the piece that was missing for scheduler/croner
   tests, which fire off real `Date` + `setTimeout`.

The upgrade itself is also a product win with zero code change: the brain is a
long-running daemon, and 1.4 ships 5× lower idle CPU, 13–48% lower HTTP server
memory, and a ~138× faster regex path under `marked` (used by
`shared/ui-library` and `interfaces/chat-repl`).

## Phase 1 — runtime bump (walking skeleton)

Bump `packageManager` to the current `bun@1.4.x` in the root `package.json`,
and align CI images. Leave `engines` at `>= 1.3.3` for now: engines is a
consumer-facing compatibility statement for the published packages, and nothing
consumer-facing requires 1.4 until Phase 3 ships a 1.4-only runtime API.

1.4 is a full runtime rewrite, so this phase is validation-heavy by design:

- Full gate battery: repo typecheck, `turbo run test`, `arch:check`,
  brain-cli packed-compat suite, site build.
- The Bun Git subprocess path is a known version-sensitive area
  ([directory-sync-export-stall.md](./directory-sync-export-stall.md) tracks a
  completion that can wedge auto-export). Run the soak explicitly:
  `bun run test:git-broker-process-inventory` and
  `bun run test:git-broker-recovery` are part of this phase's exit gate, not
  optional extras.

Ships alone. Every later phase depends on it; nothing depends on the later
phases.

Phase 1 review evidence:

- clean frozen installs preserve all three reviewed lockfiles;
- full repository lint, typecheck, tests, architecture, and forced core/site builds pass;
- all six packed-consumer tests pass;
- packaged Git-broker recovery passes both recovery scenarios, and the 100-cycle process
  inventory completes 300 Git operations with zero lost completions or zombies;
- the 350-file feature/resource and packaged-soak comparison completes equivalent work with
  no saturation, health, continuity, zombie, or deletion-authority failures; relative to
  Bun 1.3.14, Bun 1.4.0 is 5.8% slower in the feature-heavy gate and 0.7% slower in the
  packaged soak while reducing peak RSS by 14.7% and 9.8%, respectively;
- the canonical `oven/bun:1.4.0-slim` runtime image builds and reports Bun 1.4.0; and
- Rover stages all 19 reviewed instances with the expected 16/3 split and zero drift, while
  the independent yeehaa.io checks pass without enabling publication or deployment.

## Phase 2 — `--parallel` for the large test suites

Add `--parallel=4` only where measurement shows a wall-time improvement:
`plugins/directory-sync`, `packages/brain-cli`, and `shell/core`. The original
five-package candidate set also included `plugins/site-builder` and `shell/app`,
but their small suites became roughly twice as slow under worker startup, so
they retain sequential `bun test`. The explicit `=4` cap is deliberate: CI
already runs `turbo run test --concurrency=$(nproc)`, so an uncapped per-package
worker pool would oversubscribe the runner.

`--parallel` doubles as an inter-file leak detector (fresh worker processes
surface hidden ordering dependencies). Known exposure is small — one test uses
`process.chdir`, three use `mock.module` — but any leakage this phase surfaces
gets fixed in this phase, not deferred.

Local Bun 1.4 results validate the measured scope:

- directory-sync: 79.67s sequential → 23.32s parallel;
- brain-cli: 51.98s sequential → 22.14s parallel, including an isolated built-binary smoke file;
- shell/core: 4.96s sequential → 3.38s parallel;
- site-builder: 0.67s sequential → 1.45s parallel (declined); and
- shell/app: 0.46s sequential → 0.93s parallel (declined).

The parallel run also exposed a Bun 1.4 sourcemap warning in a runtime API
subprocess assertion, a built-artifact mutation race, and the new
`memoryPressure` process overload hiding POSIX signal overloads. The smoke file
now runs after the parallel workers, and the typing issues are handled without
unsafe casts. Exit gate: the three adopted suites are green locally and CI
records its own wall-time comparison.

## Phase 3 — `Bun.Image` replaces `sharp`

`sharp` is used in exactly one place —
`shared/site-engine/src/image-optimizer.ts` — for three operations:
`metadata()`, `resize()` with no-upscale, and `.webp({ quality: 80 })`.
`Bun.Image` is deliberately sharp-shaped and covers all three
(`new Bun.Image(buf).metadata()`,
`.resize(w, undefined, { withoutEnlargement: true })`, `.webp({ quality })`).

Tests first: extend `shared/site-engine/test/image-optimizer.test.ts` to pin
the observable contract before the swap — variant file naming
(`<hash>-<width>w.webp`), no-upscale skipping, fallback selection, output
dimensions, and WebP magic bytes on the written files. Then:

1. Swap the implementation to `Bun.Image`.
2. Delete the lazy-loader block (`image-optimizer.ts:9-28`) and
   `test/image-optimizer-lazy-sharp.test.ts` — the failure mode they exist for
   (sharp's `dlopen` crashing brain boot on NixOS/Alpine/minimal distros)
   no longer exists when image processing is built into the runtime.
3. Drop `sharp` from `shared/site-engine`, from `packages/brain-cli`
   (declared there only so packaged brains can satisfy site-engine's dynamic
   import), and from the root devDependencies.
4. Raise `engines` to `bun >= 1.4.0` in the root and in `@rizom/brain` — this
   is the first consumer-visible 1.4 requirement.

Implementation replaces Sharp in site-engine and in the console visual PNG
comparison, removes all Sharp dependencies, and adds deterministic PNG/WebP
contract coverage. Image and site-builder suites are green, and all six packed
compatibility contracts pass without Sharp. The console visual runner's CMS
fixture was brought back in sync with the current capability contract, allowing
all surfaces to render. Captures differ from committed baselines in the
available Chromium container, but a decoder cross-check produces identical
Sharp and `pngjs` pixel-difference ratios. The packed gate also exposed a
Bun 1.4 startup race: a contended WAL pragma prevented the SQLite busy timeout
from being installed. Applying the timeout first, with regression coverage,
restored all six packed contracts.

## Phase 4 — fake timers over fixed-sleep unit tests

The rule, decided here so each conversion doesn't relitigate it:

- **Unit tests that sleep a fixed duration to let time pass** → fake timers
  (`jest.useFakeTimers()` + `advanceTimersByTime` / `setSystemTime`), the
  pattern `shared/utils/test/debounce.test.ts` already establishes.
- **Integration tests that wait for observable async state** → `waitUntil`
  from `@brains/test-utils`, which exists for exactly this.
- Fixed `await sleep(n)` / `setTimeout(r, n)` synchronization is the
  antipattern being removed, not a third option.

First targets, in order: `shell/scheduler` (croner reads real `Date`, so Date
interception — the 1.4 addition — is what makes cron-expression tests
deterministic), `shell/job-queue`, `shared/utils`. The remaining sleep-using
files (45 across the repo at audit time) convert opportunistically whenever a
test is touched, under the rule above.

Exit gate met: no fixed-duration sleeps remain in the three named packages'
tests. Scheduler required no edits after audit. The converted utils targets
dropped from 489ms to 40ms locally; the converted job-queue targets dropped
from 2.74s to 2.66s while replacing timing races with observable gates.

## Phase 5 — `Bun.WebView` spike for media-renderer (timeboxed)

`shared/media-renderer` already isolates the browser behind the
`BrowserFactory` seam (`renderer.ts:78`), so a spike is cheap: implement a
WebView-backed factory without touching call sites.

Success criteria, all three required — decided up front so the spike ends in a
decision, not a discussion:

1. `screenshotPng` parity through the existing seam (PNG magic-byte assertion
   in `renderer.test.ts` passes against a real page).
2. `renderPdf` works via the CDP escape hatch
   (`webview.cdp("Page.printToPDF", …)`) — WebView has no first-class PDF API.
3. The `waitUntil: "networkidle"` default is replicable (WebView only resolves
   on `load`; CDP `Network.*` idle tracking must close the gap) — the
   markdown-html sanitizer comment (`shared/ui-library/src/markdown-html.ts`)
   shows render capture is a privileged context, so "load fired" is not an
   acceptable weakening.

Spike result: all three criteria pass against real Chromium under Bun 1.4. The
opt-in `Bun.WebView` adapter captures PNG, prints PDF through CDP, and waits for
a delayed network request before capture. Because WebView is still experimental,
this phase preserves `playwright-core` and existing defaults; dropping it is a
separate follow-up migration with broader production soak coverage.

## Phase 6 — targeted `retry` on timing-sensitive integration tests

Add per-test `{ retry: 2 }` only to the two env-gated packaged Git-broker
recovery scenarios, which cross HTTP, Unix-socket, subprocess, and Git process
boundaries. Per-test only — the suite-wide `--retry` flag is explicitly
declined because it hides real flakes in deterministic tests.

Repository audit found no env-gated live smoke-mailbox IMAP tests; unified-inbox
coverage is hermetic and therefore receives no retry annotation. The packaged
recovery scenarios remain opt-in through
`RUN_GIT_BROKER_PACKAGED_RECOVERY=1`.

## Explicitly declined

- **`croner` → `Bun.cron`** — `shell/scheduler` wraps croner behind
  `SchedulerBackend` with timezone support and Effect-fiber supervision;
  croner is tiny pure-JS. Migration relocates working code and risks
  timezone/validation gaps for zero deletion.
- **`marked` → `Bun.markdown`** — both consumers rely on custom renderers
  (the `ImageRenderer` contract in `shared/ui-library`, the terminal renderer
  in `interfaces/chat-repl`) and `breaks: true`. The 1.4 regex engine already
  delivers the marked speedup without a migration.
- **`gray-matter`, `remark`, `p-limit`** — no 1.4 equivalent (frontmatter,
  AST transforms, concurrency limiting).
- **standalone `--isolate`, plus `--shard`, `--changed`, `--timings`** —
  respectively: adopted `--parallel` already implies isolation; single-runner
  CI lanes; overlaps turbo affected-filtering (`workspace:affected`).
- **`Bun.serve` static dir routes** — only touchpoint is the small render
  server in `shared/media-page-composer`, which works and is not a dependency
  to delete.

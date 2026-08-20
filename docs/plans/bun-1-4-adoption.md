# Plan: Bun 1.4 adoption

## Status

**Phase 1 in review; Phases 2–6 planned.** Derived from a dependency-by-dependency
audit of the workspace against the Bun 1.4 release (2026-08). The Phase 1 review
branch pins `packageManager: bun@1.4.0`; engines remain `bun >= 1.3.3`.

## Goal

Adopt the Bun 1.4 features that remove real code and real failure classes from
this repo, and explicitly decline the ones that only relocate working code.
Three concrete wins drive the plan:

1. **`Bun.Image` replaces `sharp`** — deletes the native-binary boot-crash
   class that `shared/site-engine/src/image-optimizer.ts:9-28` documents and
   works around with a lazy loader, and drops `sharp` from the published
   `@rizom/brain` dependency set.
2. **`bun test --parallel` inside the biggest packages** — turbo parallelizes
   across packages, but directory-sync (99 test files), brain-cli (66) and
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

Add `--parallel=4` to the `test` script of the five packages whose suites are
large enough to matter: `plugins/directory-sync` (99 files),
`packages/brain-cli` (66), `shell/core` (49), `plugins/site-builder` (32),
`shell/app` (25). The explicit `=4` cap is deliberate: CI already runs
`turbo run test --concurrency=$(nproc)`, so an uncapped per-package worker pool
would oversubscribe the runner.

`--parallel` doubles as an inter-file leak detector (fresh worker processes
surface hidden ordering dependencies). Known exposure is small — one test uses
`process.chdir`, three use `mock.module` — but any leakage this phase surfaces
gets fixed in this phase, not deferred.

Exit gate: all five suites green under `--parallel=4` locally and in CI, with
before/after CI wall time recorded in the merge commit message.

## Phase 3 — `Bun.Image` replaces `sharp`

`sharp` is used in exactly one place —
`shared/site-engine/src/image-optimizer.ts` — for three operations:
`metadata()`, `resize()` with no-upscale, and `.webp({ quality: 80 })`.
`Bun.Image` is deliberately sharp-shaped and covers all three
(`new Bun.Image(buf).metadata()`, `.resize(w, h, { fit: "inside" })`,
`.webp({ quality })`).

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

Exit gate: extended image tests green, site build green, `visual:console`
regression pass, packed-compat suite green (proves the packaged brain no longer
needs sharp's native binaries).

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

Exit gate: no fixed-duration sleeps remain in the three named packages' tests,
and their suites run measurably faster (fake-timer tests spend no wall clock
in windows).

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

Timebox: one day. If all three hold, a follow-up phase migrates and drops
`playwright-core` from `shared/media-renderer` and `packages/brain-cli`. If
any fails, keep `playwright-core`, record the failing criterion in this
section, and delete the phase.

## Phase 6 — targeted `retry` on live-network tests

Add per-test `{ retry: 2 }` to the env-gated tests that talk to real external
services and are timing-sensitive by nature: the smoke-mailbox IMAP tests
(unified-inbox) and the packaged git-broker recovery test. Per-test only — the
suite-wide `--retry` flag is explicitly declined because it hides real flakes
in deterministic tests.

Exit gate: the gated live suites pass with retry annotations in place and no
retry annotation exists on any test that does not cross a network boundary.

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
- **`--isolate`, `--shard`, `--changed`, `--timings`** — respectively: no
  current cross-file pollution pathology; single-runner CI lanes; overlaps
  turbo affected-filtering (`workspace:affected`).
- **`Bun.serve` static dir routes** — only touchpoint is the small render
  server in `shared/media-page-composer`, which works and is not a dependency
  to delete.

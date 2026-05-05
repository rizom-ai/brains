# Plan: Site-Engine Progress API

## Status

Follow-up to `cd6b773d1 refactor(site-builder): decouple build engine boundaries`. The new `shared/site-engine` package owns the static-build contract, but progress reporting still leaks renderer internals across the boundary.

## Goal

Replace the renderer-step magic number in `plugins/site-builder/src/lib/run-static-site-build.ts` with a progress API that lets the engine report its own step semantics without the caller needing to know how many internal phases the renderer has.

## Non-goals

- Do not change the `SiteBuildContext` shape or other parts of the static-build contract.
- Do not redesign the broader `ProgressReporter` infrastructure in `@brains/utils`.
- Do not move site-builder orchestration into the engine.

## Current state

`run-static-site-build.ts:6`:

```ts
const STATIC_BUILD_EXTRA_STEPS = 4; // start + tailwind + assets + hydration

const totalBuildSteps =
  options.buildContext.routes.length + STATIC_BUILD_EXTRA_STEPS;

await options.staticSiteBuilder.build(options.buildContext, (message) => {
  buildStep++;
  const stepProgress =
    STATIC_BUILD_PROGRESS_START +
    Math.round((buildStep / totalBuildSteps) * STATIC_BUILD_PROGRESS_RANGE);
  options.reporter?.report({ message, progress: stepProgress, total: 100 });
});
```

The caller hardcodes the renderer's internal phase count to compute progress percentage. The comment "start + tailwind + assets + hydration" is knowledge of `createPreactBuilder` internals leaking into the orchestration layer. If the renderer adds a phase, the magic number drifts silently and progress reporting becomes wrong.

The engine contract (`shared/site-engine/src/static-build-contracts.ts:39-48`):

```ts
export interface StaticSiteBuilder<
  TContext extends SiteBuildContext = SiteBuildContext,
> {
  build(
    context: TContext,
    onProgress: (message: string) => void,
  ): Promise<void>;
  clean(): Promise<void>;
}
```

`onProgress` only takes a message — no step count, no fraction, no phase identity. So the caller has to guess.

## Proposed approach

Change the progress callback signature to carry the renderer's own step bookkeeping. Two viable shapes — pick one:

### Option A: renderer reports its own progress fraction

```ts
build(
  context: TContext,
  onProgress: (event: { message: string; progress: number; total: number }) => void,
): Promise<void>;
```

The renderer knows its phase count and emits `{ message, progress: 7, total: 12 }` events. The caller scales these into the outer progress range without needing `STATIC_BUILD_EXTRA_STEPS`.

Pros: simplest contract, no separate plan call, no magic number.
Cons: renderer must know its total up front (or estimate it), which it does today implicitly.

### Option B: renderer declares its plan, caller drives ticks

```ts
build(
  context: TContext,
  hooks: {
    plan(steps: number): void;       // called once before work starts
    tick(message: string): void;     // called per phase
  },
): Promise<void>;
```

Pros: separates "how many phases are there" from "where am I now," which is closer to how `ProgressReporter` thinks.
Cons: two callbacks for what was one; small ceremony for the renderer.

Option A is preferred. It maps cleanly onto `ProgressReporter.report({ progress, total })` and removes one indirection.

## Implementation steps

1. Update `StaticSiteBuilder.build` signature in `shared/site-engine/src/static-build-contracts.ts` to take the new progress shape.
2. Update `createPreactBuilder` (`plugins/site-builder/src/lib/preact-builder.ts`) to track its own step count and emit `{ message, progress, total }` per phase. The current phases already exist in code as logical steps — they just need numbering.
3. Update `run-static-site-build.ts` to consume the new shape: scale `progress / total` into `STATIC_BUILD_PROGRESS_START..STATIC_BUILD_PROGRESS_START+RANGE`, drop `STATIC_BUILD_EXTRA_STEPS`, drop the `buildStep++` counter.
4. Verify any other implementers of `StaticSiteBuilder` (if any) are updated; today only `createPreactBuilder` implements it.
5. Run `bun test plugins/site-builder/test` and the full typecheck.

## Validation

- `bun run typecheck` clean across `shared/site-engine` and `plugins/site-builder`.
- `bun test plugins/site-builder/test` — 94 tests still pass.
- A site build emits a monotonic progress sequence in the static-build phase range; no progress regression or stuck progress at a wrong percentage when the renderer's phase count drifts.

## Exit criteria

- `STATIC_BUILD_EXTRA_STEPS` and the "start + tailwind + assets + hydration" comment are gone.
- `plugins/site-builder` does not encode renderer phase count.
- `shared/site-engine` owns the progress contract; renderers report their own steps.

## Risk and tradeoffs

- One contract change in an interface with a single known implementer — small blast radius.
- Slight loss of "outer caller controls progress framing" — the renderer now carries its own step accounting. That's the right boundary: the engine knows how many phases it has, the orchestrator doesn't.

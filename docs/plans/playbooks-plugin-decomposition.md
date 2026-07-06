# Plan: playbooks plugin decomposition

## Status

Executing (started 2026-07-06). Second of the god-class decompositions
from `codebase-cleanup-backlog.md` (agent-service is done). Target:
`plugins/playbooks/src/plugin.ts` (~1875 lines) mixing plugin surface,
run state-machine semantics, gate evidence, lifecycle starters, and
status/context rendering.

## Goal

`PlaybooksPlugin` keeps the plugin surface (onRegister, getTools,
message subscriptions, locks, tool handlers) and delegates to focused
modules under `src/lib/`. Public API and tool behavior unchanged.

## Non-goals

- No behavior changes; the existing `plugin.test.ts` suite passes
  unmodified (it is the behavioral contract).
- No changes to the entity package layout (`src/entity/`) or
  `run-store.ts`.
- No new packages.

## Decisions

1. **Modules under `src/lib/`, package-internal.** Same pattern as the
   agent-service decomposition: not exported from the package index.
2. **Pure-function modules where the code allows.** The transition/
   machine cluster is already pure over `(body, run)`; extract it as
   functions, not a class.
3. **Phases land independently** — tests for the new module first,
   package gates green, commit.

## Phases

### Phase 1 — run-machine semantics (walking skeleton)

Extract the pure transition cluster into `src/lib/run-machine.ts`:
`buildMachine`, `createRunActor`, `canTransition`,
`getValidTransitions`, `getBlockedTransitions`,
`transitionRequiresGateVerdict`, `hasSatisfiedGateVerdicts`,
`evidenceForState`, `getState`, `formatTransition`,
`formatVerifierStatus`. Direct unit tests over a small fixture
playbook body.

### Phase 2 — status & context rendering

Extract `buildStateGuidance`, `buildAgentContextItem`'s formatting, and
`buildInstructions` into `src/lib/render.ts` as pure functions over
run/playbook/config data (any store lookups stay in the plugin and are
passed in as data). Unit tests cover guidance text for gated/ungated
states and the instructions lifecycle summary.

### Phase 3 — lifecycle starters

Extract `resolveLifecycleStarters`, `registerLifecycleStarter`,
`resolveConfiguredLifecycleStarter`, and the
`registeredLifecycleStarters` map into a `LifecycleStarterRegistry`
in `src/lib/lifecycle-starters.ts`. Unit tests cover registration,
config resolution, and conflict cases.

### Phase 4 — run engine

Extract run mutation into `src/lib/run-engine.ts`: `createStartedRun`,
`transitionRun`, `prepareGateVerdicts`, `recordEntityEventEvidence`,
`evaluateGateAfterEvidence(Locked)`, `hasSatisfiedGateForCurrentState`,
collaborating with the store, goal check, and run-machine module
(injected). The run locks stay with the plugin (they serialize tool
handlers, not engine internals). Unit tests with a fake store and goal
check.

## Verification

Per phase: new unit tests pass, `plugin.test.ts` passes unmodified,
package typecheck/lint green. At the end: full-repo gates +
`arch:check`; `plugin.ts` target under ~700 lines.

# Mock shell: one double per service

**Active.**

`shell/plugins/src/test/mock-shell.ts` is 1630 lines, and `createMockShell`
is 1350 of them — the largest single unit in the repository, ahead of the
1064-line studio app view and more than twice the supervisor closure.

125 files build a shell through it. It is the interface almost every plugin
test programs against, which makes its size a code-quality problem rather
than a test-hygiene one.

## The problem is drift, and the size is what hides it

The closure builds about fifteen service doubles against fifteen interfaces,
and nothing in the file pairs a double with the interface it fakes. A double
that has quietly stopped matching its interface — a method that accepts what
the real one rejects, a default the real service does not have — is invisible
in a 1350-line body, and a test passing against it says nothing about the
real service.

Each double being its own module makes it reviewable against exactly one
interface, and makes the shared state each one touches explicit rather than
ambient.

## What the split turns on

Every double closes over state declared at the top of `createMockShell` —
`entities`, `entityAdapters`, `enqueuedJobs`, `messageHandlers`. That ambient
sharing is what makes the closure one unit, so each extracted factory takes
the state it needs as an argument. This is the repository's existing rule:
inject collaborators rather than reach for what happens to be in scope.

`createMockShell`'s exported signature does not change. No consumer is
touched, and the existing suites are the whole net.

## Slices

One PR each, behaviour-preserving, gates green before the next starts.

1. **`defaultEntityService`** (271 lines) → `mock-entity-service.ts`, taking
   the entity maps, adapters and type configs it reads. The largest double
   and the one most tests exercise.
2. **`messageBus`** (197) → `mock-message-bus.ts`, taking the handler map.
3. **Jobs** (148) → `mock-jobs.ts`: `enqueuedJobs`, `jobs`, `jobQueueService`
   are one piece of state and its two views.
4. **`entityRegistry`** (65) with `updateEntityExportIntent` and the export
   intent map → `mock-entity-registry.ts`.
5. **`daemonRegistry`** (62) with `endpoints` and `interactions` →
   `mock-daemons.ts`.
6. **Content** (86) → `mock-content.ts`: `contentService`,
   `dataSourceRegistry` and `toContentTemplate`.

What remains is the assembly: the options, the shared state, and the 329-line
`shell` literal that names which double fills which slot — which is what the
file should have read as from the start.

## Validation

Per slice: `turbo run typecheck test` across the workspace (not just
`@brains/plugins` — the consumers are everywhere), `bun scripts/lint.mjs
--force --filter @brains/plugins`, `bun run arch:check`, and both format
lanes.

The gate that matters is the full test suite, not the plugins package alone.
A double that changed behaviour under extraction fails in a consumer, not
here.

## Risk

The doubles share mutable state, so an extraction that copies a map instead
of passing the same reference produces a mock that silently stops recording.
Each slice passes the existing object, never a spread of it.

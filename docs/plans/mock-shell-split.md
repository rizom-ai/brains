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

1. **The entity service** (397 lines) → `mock-entity-store.ts` and
   `mock-entity-service.ts`. The state moves first, because every other
   double reads it. _Shipped: 1630 → 1183._
2. **`messageBus`** (74) → `mock-message-bus.ts`, which owns the handler map
   outright — nothing else touches it.
3. **The entity registry** (65) → `mock-entity-registry.ts`, over the store
   slice 1 created.
4. **Jobs** (82) → `mock-jobs.ts`: `enqueuedJobs` and the two views of it,
   `jobs` and `jobQueueService`.
5. **Content** (105) → `mock-content.ts`: `contentService`,
   `dataSourceRegistry` and `toContentTemplate`.
6. **Daemons** (95) → `mock-daemons.ts`: the daemon and insights registries
   with `endpoints` and `interactions`.

### A correction to these numbers

The sizes above are measured; the ones this plan first carried were not. They
came from a span mapper that ends a declaration at the next one it recognises,
and three overloaded `function` declarations inside the entity service region
are invisible to it — so every double after `defaultEntityService` was
reported carrying the lines between it and the next `const`. `messageBus` was
recorded as 197 lines and is 74.

The correction changes the shape of the work, not just its arithmetic. Slice 1
was the concentration: 397 lines against 32–105 for everything left. The
remaining slices are separation rather than decongestion, and are worth doing
for the reason this plan opens with — a double you can read against one
interface — not because any of them is large.

What remains after all six is the assembly: the options, the shared state, and
a 446-line `shell` literal of 109 members whose largest is 40 lines. That is
composed, not concentrated, and it stays whole.

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

# Plugin and Interface Boundaries

## Status

Proposed. Measured against the tree 2026-08-28.

The entity tranche is finished: 18 of 18 entity packages import only
`@brains/sdk` plus shared publishable libraries. That work scoped to
`entities/` and said so. It left the other two families untouched, and they
are the larger half.

**29 packages under `plugins/` and `interfaces/`. None are clean.**

| reaches for                                                               | packages |
| ------------------------------------------------------------------------- | -------- |
| `@brains/plugins`                                                         | 28       |
| `@brains/auth-service`                                                    | 7        |
| `@brains/console-theme`                                                   | 4        |
| `@brains/site-composition`, `@brains/image`, `@brains/content-formatters` | 3 each   |
| `@brains/atproto-contracts`                                               | 2        |
| `webserver`, `topics`, `site-engine`, `scheduler`, `runtime-state`        | 1 each   |

## What the numbers actually mean

`@brains/plugins` in 28 of 29 is not a lazy import that a find-and-replace
fixes. It is the base class. Of the 29, **20 extend `ServicePlugin`, 3 extend
`InterfacePlugin`, and 4 extend `MessageInterfacePlugin`** — and **not one
uses a declarative definition.** Where the entity tranche converted packages
that were already half-declarative, this tranche has not started.

The declarative surface they would convert _to_ already exists and is
published — `defineServicePlugin` is used by every converted entity package,
and `defineInterface` / `defineMessageInterface` are in the export ledger.
But the interface pair has **no consumer in the repo**: only three
compatibility fixtures under `packages/brain-cli/test/fixtures/public-authoring/`
exercise them. They are proven to compile, not proven to carry a real
interface. The first conversion is therefore also the first honest test of
that API, and should be expected to find gaps the way each entity conversion
did.

## The sharper problem

`plugins/directory-sync` holds **five `as IEntityService` casts** — the only
casts of their kind in the tranche. A cast is worse than an import: it is a
boundary violation that typechecks, so no gate catches it and no audit of
imports reports it.

`work/turso-migration` has already solved this, in `01daa20b7`: service
plugins get `context.entityCoordination`, a handle-based durable
bulk-mutation surface bound to the plugin id as mutation source. `begin`
returns a batch handle; worker-side run and settle are keyed by the ref token
from job data; `source` and `operationId` disappear from plugin code and job
payloads entirely. Directory-sync then compiles against `EntityServiceClient`
alone and all five casts are deleted.

That work is done and should be taken from that branch rather than redone.
This plan's job is the other 28.

## Decisions

- **Convert, do not re-export.** The temptation with 28 packages sharing one
  import is to widen the SDK until `@brains/plugins` is reachable through it.
  That would move the boundary rather than hold it. The import exists because
  the package extends a class; the fix is the declaration.
- **Auth-service first among the tail.** Seven packages read permissions and
  identity through it. Whatever slice they need is one capability, and
  finding it once serves seven.
- **Some of the tail is misfiled, not misused.** `console-theme`,
  `site-composition`, `content-formatters` and `image` look like shared
  publishable libraries that belong beside `@brains/sdk` in the allowed set
  rather than something to route around. Each gets a decision, not a
  conversion, and the decision is recorded before any code moves.
- **`plugins/knowledge-map` importing `@brains/topics` is a different smell.**
  A plugin reaching into another plugin is a dependency between two things
  that ship independently. It is called out separately because the fix may be
  a contract in `shared/`, not a capability on the context.
- **No count claims until measured.** The entity tranche's changeset said
  "every official entity and plugin package", which was true of 18 entity
  packages and false of everything here. It has been narrowed.

## Phases

Each phase is a shippable slice with its tests written first, and each
conversion adds capability only with a named consumer — the discipline that
made the entity tranche find real defects rather than move code.

1. **Take directory-sync's casts from turso.** Cherry-pick or rebuild
   `01daa20b7`, so the one boundary violation that typechecks is gone and the
   `entityCoordination` capability exists for anything else that needs it.
   Exit: zero `as IEntityService` in the repo, enforced by a check.

2. **Convert one interface.** `chat-repl` — the lightest of the seven, with
   four internal dependencies against `email` and `webserver`'s six and
   `web-chat`'s eight — as the first real consumer of `defineInterface`.
   Expect gaps: three fixtures are a weaker proof than one live interface,
   and finding them is the point.

3. **Convert one service plugin.** Likewise the smallest — `analytics`,
   `notifications`, `profile` or `onboarding` — as the first `plugins/`
   conversion, establishing what a service plugin needs that an entity
   package did not.

4. **Auth-service as a capability.** The seven consumers named, one slice
   designed against all seven rather than the first one encountered.

5. **Decide the shared libraries.** `console-theme`, `site-composition`,
   `content-formatters`, `image`: publishable beside the SDK, or replaced.
   Written down before any of them moves.

6. **The remaining conversions**, in dependency order, each closing its
   package's internal imports.

## Validation

- A check that fails on `as I*Service` casts anywhere outside `shell/`, so
  the class of defect directory-sync had cannot return silently.
- Per-package: `src` imports only `@brains/sdk`, `@brains/utils`,
  `@brains/contracts` and whatever the phase-5 decision admits.
- The export ledger and authoring doc stay consistent with every capability
  added, enforced by `public-authoring-golden.test.ts`.
- A count in this plan's status, updated as packages land, so the tranche's
  progress is a measured number rather than an impression.

# Plugin and Interface Boundaries

## Status

Phase 1 done. Counts re-measured against the tree after the rebase onto
`origin/main`; the first draft said 29 packages, which was wrong when written
(28) and is now 30 — main added `plugins/email-triage` and `plugins/studio`.

The entity tranche is finished: 18 of 18 entity packages import only
`@brains/sdk` plus shared publishable libraries. That work scoped to
`entities/` and said so. It left the other two families untouched, and they
are the larger half.

**30 packages under `plugins/` and `interfaces/`. None are clean.** Not one
depends on `@brains/sdk`, and not one uses a declarative definition.

| reaches for                                                          | packages |
| -------------------------------------------------------------------- | -------- |
| `@brains/plugins`                                                    | 28       |
| `@brains/auth-service`                                               | 7        |
| `@brains/content-formatters`                                         | 4        |
| `@brains/console-theme`, `@brains/site-composition`, `@brains/image` | 3 each   |
| `@brains/atproto-contracts`                                          | 2        |
| `webserver`, `topics`, `site-engine`, `scheduler`, `runtime-state`   | 1 each   |

## What the numbers actually mean

`@brains/plugins` in 28 of 30 is not a lazy import that a find-and-replace
fixes. It is the base class. Of the 30, **20 extend `ServicePlugin`, 3 extend
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

## The sharper problem, now closed

`plugins/directory-sync` held **five `as IEntityService` casts**. A cast is
worse than an import: it is a boundary violation that typechecks, so no gate
caught it and no audit of imports reported it — the package read as clean
while the boundary was gone.

`01daa20b7` from `work/turso-migration` is cherry-picked. Service plugins get
`context.entityCoordination`, a handle-based durable bulk-mutation surface
bound to the plugin id as mutation source; `source` and `operationId` leave
plugin code and job payloads. Directory-sync compiles against
`EntityServiceClient` alone and all five casts are gone.

`bun run casts:check` now fails on any `as I*Service` outside `shell/`, in the
pre-commit hook and CI, so the class cannot return silently. Three further
casts lived in `plugins/` tests and were fixed at the source. Inside `shell/`
those interfaces are the local vocabulary, which is why the ban stops there.

This plan's remaining job is the 30 packages themselves.

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

1. **Take directory-sync's casts from turso.** _Done._ `01daa20b7` is
   cherry-picked, minus the RPC exports it carried that belong to the turso
   branch — the coordination module imports only zod and the local
   `EntityService` type, so it separates cleanly. Directory-sync compiles
   against `EntityServiceClient` alone and its five casts are gone. Three
   more lived in `plugins/` tests and are fixed at the source: the shared
   mock already had the `createEntityImpl`/`updateEntityImpl` slots
   stock-photo was casting around. `bun run casts:check` now fails on any
   `as I*Service` outside `shell/`, in the pre-commit hook and CI.

2. **Convert one interface.** _Target corrected, gaps measured._ The first
   draft picked `chat-repl` by counting entries in its `package.json`, which
   is a proxy for nothing — and `chat-repl` extends `MessageInterfacePlugin`,
   so it would prove `defineMessageInterface`, not `defineInterface`.

   Measured by symbols actually taken from `@brains/plugins`, and by how many
   of those the SDK is missing:

   | package     | base class | symbols | missing from SDK |
   | ----------- | ---------- | ------- | ---------------- |
   | `email`     | message    | 4       | 1                |
   | `webserver` | interface  | 11      | —                |
   | `mcp`       | interface  | 13      | 6                |
   | `a2a`       | interface  | 18      | 7                |
   | `chat-repl` | message    | 22      | —                |
   | `web-chat`  | message    | 47      | —                |
   | `chat`      | message    | 55      | —                |

   **`webserver` is not convertible and should leave this list.** It _is_ the
   HTTP host: it reads `context.httpRoutes.getRoutes()` and runs
   `Bun.serve()`, serving the routes other interfaces declare. The authoring
   contract says the runtime owns HTTP hosting, so webserver cannot be
   expressed as a consumer of the contract it implements. That is a question
   about where it lives, not how it is authored.

   `email` is the smallest by every honest measure and its one missing symbol,
   `Daemon`, dissolves into `defineDaemon`. Converting it surfaced six things
   `defineMessageInterface` cannot yet express, each verified against
   `MessageInterfaceDefinitionInput` rather than the fixture:

   1. **Channel subject validation.** Email validates an address with a regex
      `subjectPattern`. `MessageChannelDefinition` carries `recipient`, which
      types a _recipient payload_, not the channel subject.
   2. **`manualDelivery`** on the channel descriptor. No slot.
   3. **Delivery availability.** Email registers its provider only when
      `apiKey` and `from` are configured, and an inbound-only posture must
      still boot. `deliver` is present or absent at authoring time, with no
      runtime availability predicate.
   4. **Scoped runtime state.** Email keeps an IMAP UID cursor and a
      source-locator store through `context.runtimeState.scoped`. `setup`
      receives `config` and nothing else.
   5. **Request/response subscription.** Email answers `EMAIL_SOURCE_READ`
      over messaging. A message interface has no subscription slot.
   6. **Injected dependencies.** Its tests supply `fetchImpl`, an IMAP client
      factory, and a sleep. A declaration has no constructor.

   Three and four are the load-bearing ones: without them a declared message
   interface cannot hold state across a restart or degrade to inbound-only,
   which is not an email quirk. Each gets a slot with email as the named
   consumer, or email stays a class and the API is honestly not ready for it.

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

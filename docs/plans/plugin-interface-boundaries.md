# Plugin and Interface Boundaries

## Status

Phases 1, 2 and 3 done; **2 of 28 packages converted** (`@brains/email`,
`@brains/notifications`).

The count has been wrong three times, each time because it was taken from
directories on disk. It is **28 tracked `package.json` files** under
`plugins/` (21) and `interfaces/` (7) — `git ls-files 'plugins/*/package.json'
'interfaces/*/package.json'`. The earlier 29 and 30 counted `plugins/cms`,
which holds nothing but a stale `dist/`, and `plugins/email-triage`, an empty
directory; both are untracked leftovers of main's CMS-to-Studio rename, with
no manifest and nothing referencing them. Count manifests, not folders.

The entity tranche is finished: 18 of 18 entity packages import only
`@brains/sdk` plus shared publishable libraries. That work scoped to
`entities/` and said so. It left the other two families untouched, and they
are the larger half.

**28 packages under `plugins/` and `interfaces/`; 2 are clean.**
`@brains/email` and `@brains/notifications` depend on `@brains/sdk` and
declare themselves; the other 26 still import `@brains/plugins` in `src`.

| reaches for                                                          | packages |
| -------------------------------------------------------------------- | -------- |
| `@brains/plugins`                                                    | 26       |
| `@brains/auth-service`                                               | 7        |
| `@brains/content-formatters`                                         | 4        |
| `@brains/console-theme`, `@brains/site-composition`, `@brains/image` | 3 each   |
| `@brains/atproto-contracts`                                          | 2        |
| `webserver`, `topics`, `site-engine`, `scheduler`, `runtime-state`   | 1 each   |

## What the numbers actually mean

`@brains/plugins` in 26 of 28 is not a lazy import that a find-and-replace
fixes. It is the base class: **20 packages extend `ServicePlugin`, 3 extend
`InterfacePlugin`, and 4 extend `MessageInterfacePlugin`.** Where the entity
tranche converted packages that were already half-declarative, this one
started from classes — which is why each conversion so far has found gaps in
the API it converts to rather than merely moving imports.

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

This plan's remaining job is the 26 packages that are still classes.

## Decisions

- **Convert, do not re-export.** The temptation with 28 packages sharing one
  import is to widen the SDK until `@brains/plugins` is reachable through it.
  That would move the boundary rather than hold it. The import exists because
  the package extends a class; the fix is the declaration.
- **Auth-service is three capabilities, not one.** Seven packages import it,
  which looked like one shared need until the calls were counted: resolving a
  caller, asking what this deployment is, and recording an audit event are
  three different questions. `plugins/admin` is a fourth case entirely — it
  administers auth-service rather than consuming it. Phase 4 carries the
  measurement.
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
   `Daemon`, dissolves into `defineDaemon`. **It is converted.** Its `src`
   imports only `@brains/sdk`, `@brains/contracts` and `@brains/utils`, and it
   is the first production consumer either interface API has ever had.

   The count moved twice while doing it, which is the answer the phase was
   asked for. Six were guessed from reading `setup`, the channel and the
   subscription surface. Two of those dissolved: `manualDelivery` is already
   derived from `deliver`, and injected dependencies need no slot — the
   package exports a factory that closes over them and default-exports
   `emailInterface()`, which is what `@brains/link` already does. Then five
   more appeared that only writing the conversion could find. Nine in total:

   1. **Channel subject validation.** `subjectPattern` on the channel.
      `recipient` types a payload, not the subject a person types.
   2. **Delivery availability.** An `available` predicate. An interface that
      answers "no" registers its channel and **no delivery provider** — two
      callers read a provider's presence as "delivery is possible", so
      registering an unavailable one would have quietly misled them.
   3. **Durable state in `setup`.** A `runtimeState` scope factory.
   4. **Request/response subscriptions**, with `defineSubscription` so the
      handler sees its payload typed, as `defineRoute` types a body.
   5. **The delivery envelope.** `MessageOutput` is chat-shaped — a body and
      nothing else. `deliver` was silently dropping subject, html, threading,
      idempotency key and sensitivity, and flattening every failure into one
      code. It now receives the whole envelope and may return a reason.
   6. **Reaching the bus from `setup`.** Not everything an interface receives
      is a chat turn; an inbound email is an event other packages consume.
   7. **A logger in `setup`**, for the same reason.
   8. **Pulled daemon health.** `ready`/`warning` are pushed at moments the
      daemon chooses, which cannot express a mailbox that is connected or
      reconnecting _now_. `defineDaemon` takes a `check`, authoritative while
      the daemon runs — once stopped the recorded outcome stands, so a daemon
      that failed to shut down cannot report itself healthy.
   9. **Declared interfaces in the brain model.** `InterfaceEntry` required a
      constructor, so the composition layer could not name a declared
      interface at all.

   Two things the tests caught that would have shipped as defects. The class
   replaced a failed IMAP disconnect with a fixed message because the
   transport's own error carries host, user and password; the first draft of
   the conversion let the raw error through to daemon health. And runtime
   state is namespaced by the interface's **id**, not its package name as on
   the entity side — a stored cursor lives under `email.inbound.uid-cursor`,
   and an inbound mailbox with no cursor re-reads from UID 0, delivering every
   message in it again as new.

   One rough edge, found by building a repro rather than trusting the first
   explanation. It is not the factory: a wrapped, annotated `defineMessageInterface`
   infers `state` perfectly well. It is **property order**. A slot whose
   context carries `state` — `available`, `daemons`, `deliver` — destructured
   _above_ `setup` resolves that context before the state type exists, and the
   generic's default silently wins, so every later slot reports its own fields
   as missing. Moving `setup` first fixes it and `@brains/email` needs no
   explicit type arguments. The contract now says so on `setup`, since the
   failure names the wrong culprit: it points at the slots, not the ordering.

3. **Convert one service plugin.** _Done: `@brains/notifications`._ One file,
   104 lines, whose entire job is answering one request on the bus — and it
   took nothing from `@brains/plugins` but the base class.

   It needed three things a service could not say:

   - **`subscriptions`.** Reactions cover checks, inbox actions and tools;
     none of them is a request arriving on a topic. This is the same slot
     message interfaces needed, so the definition moved to
     `contracts/subscription.ts` and `defineSubscription` now serves both —
     abstracted at two consumers rather than three.
   - **`channels` and `logger` in `setup`.** A service that routes an alert
     resolves a transport by the recipient's channel type. It reads only: a
     narrow `ServiceChannelReader`, not the registry, because registering a
     descriptor belongs to the interface that owns the channel.
   - **Failure semantics.** The first cut wrapped every handler return as a
     success, so a refusal arrived as `{success: true, data: {success: false}}`.
     A handler that cannot answer now throws, and the runtime reports a failed
     response — in both families.

   **Composition was collapsed to one adapter in the same change**, while only
   two packages were converted and the blast radius was small. Phase 2 had
   added `declaredInterface` beside `packageCapability` because `InterfaceEntry`
   demanded a constructor, which a declaration cannot satisfy. That was two
   adapters for two lists differing only historically. Both now take the same
   `PluginFactory`: class-based interfaces are wrapped at their call site
   (`(config) => new MCPInterface(config)`), `InterfaceConstructor` and
   `DeclaredInterface` are deleted, and one `packageFactory` binds metadata and
   instantiates for either list. The remaining split between `plugins:` and
   `interfaces:` is only the third tuple slot — a capability config versus an
   env mapper that may return null to skip.

4. **Auth-service as capabilities.** _Measured; the premise was wrong._ The
   phase assumed one slice would serve all seven. Every one of the seven does
   import `getActiveAuthService` — an ambient accessor, which is why the count
   looked uniform — but what they _call_ on it falls into four shapes:

   | consumer                          | calls                                                    |
   | --------------------------------- | -------------------------------------------------------- |
   | `web-chat`, `dashboard`, `studio` | `resolveSession`                                         |
   | `mcp`                             | `resolveBearerGrant`                                     |
   | `web-chat`                        | `createAuthLoginResponse`                                |
   | `a2a`                             | `getIssuer`, `isLoopbackIssuer`, `issuerFromRequest`     |
   | `studio`, `admin`                 | `recordAuditEvent`, `queryAuditEvents`                   |
   | `admin`                           | twenty methods: users, invitations, passkeys, identities |
   | `chat`                            | nothing — it imports `AuthPrincipal` as a type           |

   So: **a caller capability** (who is this request from — session, bearer
   grant, login response), **an issuer capability** (what this deployment
   is, for federation), and **an audit capability** (record and query). Those
   three cover six of the seven, and `chat` needs only a type.

   `admin` is not a consumer of a slice — it is the administration surface
   _for_ auth-service, reaching twenty methods across users, invitations,
   passkeys and identities. Granting that as a capability would publish
   auth-service's whole management API through the SDK, which is the opposite
   of a boundary. Either it stays coupled and is excluded from the tranche
   with that written down, or auth-service exports an admin-facing package of
   its own. Deciding that is part of this phase, not a detail of it.

   Order: caller first (three consumers, smallest surface), then audit (two),
   then issuer (one), then the `admin` decision.

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

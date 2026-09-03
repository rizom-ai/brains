# Plugin and Interface Boundaries

## Status

Phases 1 through 5 done, phase 6 underway; **12 of 28 packages converted**
(`@brains/email`, `@brains/notifications`, `@brains/onboarding`,
`@brains/atproto-registry`, `@brains/obsidian-vault`, `@brains/analytics`,
`@brains/profile`, `@brains/site-info`, `@brains/knowledge-map`,
`@brains/admin`, `@brains/unified-inbox`, `@brains/playbooks`).

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

**28 packages under `plugins/` and `interfaces/`; 5 are clean.** The other
23 still import `@brains/plugins` in `src`.

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
- **The shared-library tail is admitted, not routed around.** `console-theme`,
  `site-composition`, `content-formatters` and `image` are shared
  publishable libraries beside `@brains/sdk` — decided on measurement in
  phase 5, nothing replaced, nothing moved.
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

   **`defineInterface` — the generic half — still had no consumer, and
   `@brains/mcp` is the smallest one.** Five additions are done, with tests;
   the conversion itself is not, and the reason is worth recording.

   The five are one shape. A generic interface had `routes` and `daemons` and
   nothing to hold: no way to build a transport once, no way to refuse to
   start, no tools of its own. So it gains `setup` — with `plugins` to ask
   whether the host it mounts on is present, `endpoints` and `interactions`
   to advertise where it can be reached, `mcpTransport` for the protocol
   server it wraps, `permissions` for what that transport confers, and
   `agent` because an interface's own tools are conversational — and a
   `tools` slot to declare them. `directMcpExposure` came with them: it
   defaults from `sideEffects`, which is right for a tool that acts on the
   brain and wrong for one that _is_ the conversation.

   Two of those were extractions rather than additions. `runtimeTool` was
   ~60 lines in the service plugin doing the parse, the confirmation gate and
   the success envelope; both families need all three, so it moved to
   `service/tool-runtime.ts` and each supplies only what differs — the
   context the handler runs in. And `createReactionContext` stopped building
   entity access from a service, because an interface has a read-only entity
   service by design; it now takes the access, and an interface supplies one
   that reads and refuses every write, since it declares no types for a write
   to be checked against.

   **What stopped the conversion is the confirmation pipeline.** mcp's `chat`
   tool answers with the agent's own pending confirmation — not "this tool
   wants approval", which `defineTool` already says, but "the brain asked you
   something back". A declared tool returns data and the runtime wraps it;
   there is no way to return that. That is exactly the slice already scoped
   for `chat-repl`, `chat` and `web-chat`, and doing it here as a one-off for
   mcp would pre-empt the design three other packages need. **mcp is its
   fourth named consumer**, which is the strongest argument for taking that
   slice next — and it has since been built, in phase 2 above. What mcp
   still needs from it is the piece the message pipeline does not cover: a
   declared _tool_ answering with a pending confirmation, rather than a
   declared _interface_ presenting one.

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

   **The `admin` decision is made: expand the surface, deliberately.**
   Options weighed and rejected: an SDK capability for the raw class (a hole
   with a nicer name), a documented exception (waives the tranche's goal),
   merging admin into `shell/auth-service` (no shell package declares a view
   today — every workspace and widget declarer lives in `plugins/` or
   `entities/`, and the merge would be the first to break that), and bus
   contracts (twenty request/response topics for one in-process caller).

   What shipped instead: `AuthAdministration` — the measured set of
   twenty-two operations the workspaces perform, grouped people /
   invitations / peers / identities / audit, in the class's own vocabulary
   because inventing a second one for a single consumer is surface without
   meaning. `AuthService implements` it nominally, so drift breaks the build
   at the class; a conformance test breaks it from the consumer's side.
   `@brains/admin` types against the contract and no longer names the class.
   The type is published on `@rizom/brain/services` as
   advanced-with-consumer — type-only, since holding the type cannot conjure
   the service. The HTTP admin endpoints keep their separate transport-shaped
   `AuthAdminOperations`; that adapter is not the capability.

   Untangling this also surfaced a dead edge: `shell/auth-service` declared
   `@brains/notifications` as a dependency and imported nothing from it (the
   contract lives in `@brains/contracts`), which the SDK's new type-only
   auth-service edge turned into a package cycle. Removed.

   The other three shipped the same way. `AuthCaller` — who a request is
   from: session, bearer grant, or the login response for a request carrying
   neither. `AuthAudit` — record and query as one surface, and
   `AuthAdministration extends AuthAudit` so what studio records and what
   administration queries cannot drift apart. `AuthFederation` — the issuer
   this brain speaks as, recorded peer trust, and the signing key; measuring
   a2a also turned up `getA2ASigningKey`, which the original seven-consumer
   audit missed. The pure issuer helpers stay free functions. All are
   implemented nominally by `AuthService`, covered by conformance tests, and
   published type-only as advanced-with-consumer — caller and audit on the
   services entry for dashboard and studio, caller, federation and the
   helpers on the interfaces entry for web-chat, mcp, chat and a2a.

   **Phase 4 is done.** Consumers still reach the instance through
   `getActiveAuthService`; retiring that ambient accessor for a granted
   context capability belongs to each package's own conversion in phase 6,
   where the contract each one compiles against is now already named.

5. **Decide the shared libraries.** _Done: all four admitted as publishable
   beside the SDK_, each on its own evidence rather than as a batch:

   | library              | src      | deps                                 | users | evidence                                                                                                                                                                                               |
   | -------------------- | -------- | ------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | `content-formatters` | 18 files | contracts, utils, js-yaml, remark    | 11    | already partially SDK-published (`StructuredContentFormatter`, consumer `@brains/series`); the entity tranche shipped with entities importing it directly                                              |
   | `site-composition`   | 14       | content-formatters, templates, utils | 5     | already partially SDK-published (`fetchSiteInfo`, `FeedItem`); its closure is entirely inside the published one                                                                                        |
   | `console-theme`      | 6        | contracts                            | 3     | a leaf: the palette, type ramp and console surface web-chat, dashboard and studio render with — presentation vocabulary, not runtime                                                                   |
   | `image`              | 7        | entity-service, utils, remark        | 3     | its one runtime edge is nominal — a `BaseEntity` type and `baseEntityParserSchema`, the same base-entity vocabulary the SDK publishes, and `@brains/entity-service` is already a direct SDK dependency |

   The suspicious one was `image`: a "shared library" depending on
   `shell/entity-service` looks like runtime leaking into the shared layer.
   Measured, it isn't — the edge is the shared entity vocabulary, not the
   service. Nothing is replaced and nothing moves.

   The per-package allowed set for this tranche is therefore: `@brains/sdk`,
   `@brains/utils`, `@brains/contracts`, `@brains/templates`,
   `@rizom/brain-ui`, `@brains/atproto-contracts`, and these four.

6. **The remaining conversions**, in dependency order, each closing its
   package's internal imports.

   **`stock-photo` is gated on a measured API gap.** Its select job creates
   `image` entities — another package's type — and stamps cover ids on
   arbitrary targets. The sanctioned mechanisms both exist and both fall
   short: `EntityGenerationLink` lets the runtime do the cross-type link,
   but only for entity-generation-family jobs; create-route delegation runs
   the owning package's logic, but only the agent's system tools invoke the
   create interceptor — no package-facing path reaches it. Closing this
   means a URL-intake job on `entities/image` (owned-type create, linkInto)
   plus a programmatic enqueue for another type's declared generation — its
   own slice, with stock-photo as the named consumer, not a detail of its
   conversion.

   **The chat interfaces are gated on confirmations.** `chat-repl`, `chat`
   and `web-chat` each hand-roll the same three things: a
   `PendingApprovalTracker` per conversation, `routeConfirmationResponse`
   before the agent call, and `buildResponsePlan` to render the reply. The
   declarative pipeline's `receiveAuthenticated` sends `response.text` and
   nothing else, so converting any of them as-is would drop confirmation
   handling — a user replying "yes" to a pending approval would be answered
   as if it were a new question.

   The shared halves already exist as functions in `@brains/plugins`; what
   is missing is that the runtime pipeline never calls them, and that
   rendering legitimately differs per interface (a terminal formats an
   approval as text with `yes 1` sugar; web-chat renders a card). So the
   slice is: the pipeline owns tracking and routing, and an interface
   declares how an approval is presented. Three named consumers, measured —
   its own slice, ahead of any of the three conversions.

   **Built, with tests.** The pipeline now holds a `PendingApprovalTracker`
   per conversation, routes an incoming message through
   `routeConfirmationResponse` before putting it to the agent, resolves a
   matched approval through `confirmPendingAction`, and syncs the tracker
   from whatever comes back. An interface says the rest in two slots:

   - **`present`** takes one `ResponseRenderDirective` — the runtime already
     decides what an answer is made of and in what order — and returns the
     text to send, or nothing when this interface renders that part some
     other way. Omitting it sends the response text and drops the rest,
     which is exactly what every declared interface did before.
   - **`interpret`** is its inbound half, and only exists because the two
     are not symmetric. A terminal that numbered the approvals it printed
     accepts "yes 2", and only that interface knows what 2 refers to; a
     client with buttons has no ordinals at all. It rewrites the message
     before routing, or returns it unchanged.

   The split is the point: everything that must not drift between
   interfaces — what is pending, what a reply resolves, what an answer
   contains and in what order — is the runtime's, and everything that is a
   rendering decision stays with the interface that renders it.

   **`site-content` is gated on batch work it does not own.** Its generate
   tool decides which sections can generate by asking
   `templates.getCapabilities(name)` about templates other packages
   registered, then enqueues a batch of the shell's own
   `SHELL_CHANNELS.contentGeneration` job type. The declarative `jobs`
   surface enqueues jobs the package itself declared, one at a time; neither
   half of what site-content does is expressible. Closing it means a
   template-capability read and a declared batch enqueue — related to
   stock-photo's gap (both are a package asking the runtime to run work it
   does not own) and worth deciding together.

   **`unified-inbox` was measured at three additions and needed four.**
   Converted. The `inbox`/`inboxFollowUps` readers in `setup` and the
   `interactions` slot were the first three. The fourth was its digest — a
   recurring check whose destination URL was built from `siteUrl` and
   `webRoutes.getRoutes()`, neither of which reached the `checks` context.

   The fourth is worth reading for how it was closed, because the obvious
   shape was the wrong one. Handing checks the raw route table would have
   preserved the behaviour exactly: the digest looked through every mounted
   route for one the `dashboard` plugin owns, and linked there when Studio
   was absent. But a package guessing at another package's routes is the
   thing this plan exists to remove — a heuristic the code itself flagged as
   provisional. What the digest actually needs is narrower and answerable:
   where did _my own_ workspace end up. So `checks` and `interactions` both
   gained `workspaceUrl(id)`, resolved by the runtime from what Studio
   returned when it registered the workspace, and `siteUrl` joined the
   reaction context to make the path absolute. Without Studio the answer is
   `undefined`, and the digest links to the brain itself rather than
   somewhere it hoped a console might be.

   Two things fell out of the conversion that are worth stating plainly.
   The runtime now refuses a workspace URL that is not same-origin, which
   the package used to check for itself — a package should not have to
   defend against its own host. And the list tool's name changed: it was
   registered by hand as `inbox_list`, naming no plugin, and the
   declarative surface scopes tool names, so it is `unified-inbox_list`. An
   MCP client with the old name saved will not find it.

   The lesson is worth keeping: three of these were visible from the plugin
   file, and the fourth only from following the digest into the helper it
   calls. Measuring a conversion means reading what the helpers reach for,
   not only what the plugin class does.

   **`playbooks` was the first conversion whose gaps were about state.**
   Converted, and it took five additions. Four are `setup` slots, and they
   share one shape: a package whose engine runs on the agent's schedule
   rather than a caller's needs handles it can hold. `entities` reads its own
   type; `state` opens the runtime-state scope its run store writes; `corpus`
   searches for evidence; `judge` puts that evidence to the model. The fifth
   is `source` on a subscription — a registry that refuses a second claim on
   the same lifecycle starter has to name who holds it.

   `corpus` and `judge` are worth separating. The goal check asks whether a
   run's stated outcome actually holds, and it answers from what the brain
   recorded rather than from what the agent said it did. That is a search
   across every type except the package's own — a playbook must not find the
   document that states its goal and call the goal met.

   Two bugs fell out, both older than this conversion. The runtime-state
   namespace validator rejects `@` and `/`, and three call sites built a
   namespace as `${packageName}.${namespace}` — so a scoped package could
   never have used runtime state at all. Playbooks was the first to try.
   And the entity half's schemas carried a full duplicate set of "parser"
   variants that existed only to feed the base entity schema; the codec
   contract needs one schema, so they are gone.

   Two renames, both from scoping the declaration: `playbook_manage` is now
   `playbooks_manage`, and the `playbook` capability is folded into
   `playbooks` — one package registers both the type and the runs that walk
   it, so there is nothing left for a separate capability to name.

### What the remaining tranche actually is

Nine conversions in, the pattern is clear and worth stating: the rest is
**not nineteen mechanical conversions**. It is roughly four capability
slices — cross-type create (stock-photo), the confirmation pipeline (three
chat interfaces **and now mcp**), the auth instance (admin, studio,
dashboard, since done), and batch/foreign work (site-content) — each with
named consumers, and the conversions sit behind them. The confirmation
pipeline has the most: four packages cannot convert until a declared tool
can answer "the brain asked you something back". Every conversion so far has found gaps rather
than moved imports, exactly as this plan predicted; what has changed is
that the remaining gaps are now measured up front instead of one package at
a time.

## Validation

- A check that fails on `as I*Service` casts anywhere outside `shell/`, so
  the class of defect directory-sync had cannot return silently.
- Per-package: `src` imports only `@brains/sdk`, `@brains/utils`,
  `@brains/contracts` and whatever the phase-5 decision admits.
- The export ledger and authoring doc stay consistent with every capability
  added, enforced by `public-authoring-golden.test.ts`.
- A count in this plan's status, updated as packages land, so the tranche's
  progress is a measured number rather than an impression.

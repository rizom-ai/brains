# Plan: Typed contracts for cross-plugin bus calls

## Status

**In progress; Phases 1–3 shipped.** Inventory taken on main `83a3e0ca61` (2026-11-05). `defineBusContract` lives in `@brains/contracts`; `requestContract`, `collectContract` and `answerContract` in `@brains/messaging-service` serve shell code, and the messaging namespace delegates to them as `request`, `gather` and `answer`. Contracts so far: `note:capture`, `auth:principal:resolve`, `notifications:send`, `agent:context:request`, `guest:asked-before`, `projection:wave-ready`, `agent:action:request`, `sync:path:request`, `email:source-read`, `email:inbound`, `console:jump-destinations`, `chat:space-notice`, `chat:space-notice-action`, `topics:public-titles` and `topics:source-types`.

35 live message-bus channels carry requests or commands across package boundaries. Fourteen run from shell code to a plugin, and 21 run between plugins. Two typed context namespaces wrap a few of them: `context.dashboard` (four channels) and `context.studio` (two). Everything else is a raw `messaging.send({ type, payload })` whose reply the caller casts to the type it expects.

Ten channels share a Zod request and response schema checked on both sides. The rest validate on one side only, keep a local copy of the schema at each end (the three A2A channels), or carry plain TypeScript types (`generate:*`). A further 15 handler channels have no production sender, and ten sends have no subscriber.

## Goal

Every request or command that crosses a package boundary goes through one typed contract:

- its channel, its request schema, its response schema and its delivery mode are declared once in `@brains/contracts`;
- the sender gets a validated, typed reply or an explicit "no one handles this", never a cast;
- the handler gets a validated request or a refusal, never an unchecked payload.

## How the bus behaves today

These facts constrain the design; each was checked against `shell/messaging-service`.

- A plain `send` calls handlers in registration order and stops at the first that returns anything (`message-dispatcher.ts`, `publishRequest`). A handler that answers for messages it does not own swallows them. This hid a real defect: `generate:execute` reached only one of newsletter and social-post on brains scheduling both (fixed in #823 by broadcasting it).
- With no subscriber, `send` resolves `{ success: false, error: "No handler found for message type: …" }`. It never surfaces `{ noop: true }`, so the `"noop" in response` checks in `principal-resolution.ts`, `shellBootloader.ts`, `identity-agent-services.ts` and `studio-namespace.ts` never match.
- Because absence and failure look the same, `resolvePrincipalViaBus` throws "Principal resolution unavailable" on a brain without auth-service, though its comment promises null. Callers that match on error strings ("Agent asking is unavailable") or treat every failure as absence are guessing.
- `toMessageResponse` casts `data` to the caller's `R`; its own comment names the missing piece: "removing this needs a response schema on Channel".
- `defineChannel` (internal and public SDK) pairs a name with a payload schema only; its response type is a marker never checked at runtime, and no production plugin uses it. A channel subscription answers an invalid payload with `{ noop: true }`, which the bus reports to the sender as success.
- `collect` gathers one answer from every subscriber and is already the right primitive for fan-in (`agent:context:request`, `guest:asked-before`, head scripts, slots, jump destinations).

## Decisions

### One contract object, three delivery modes

`@brains/contracts` gains `defineBusContract({ channel, request, response, delivery })`. A contract is a channel too (`name` and `schema`), so it fits wherever `defineChannel`'s channels do. `delivery` is one of:

- `"request"`: exactly one owner answers. An answer from a non-owner is a defect, so a second subscriber is refused when a contract is registered.
- `"collect"`: every subscriber answers, and the sender receives the validated answers.
- `"command"`: every subscriber receives it and nobody answers. This is broadcast, replacing ad hoc `broadcast: true` and reply-ignoring sends.

Existing schemas move into contracts as they are migrated, and no schema is restated. Local duplicates are deleted: the A2A network-ask and call schemas, Studio's `a2aAgentListSchema` and `syncStatusMessageSchema`, and site-content's `routesResponseSchema`.

### The messaging namespace speaks contracts

`IMessagingNamespace` gains `request(contract, payload)`, `gather(contract, payload)` for collect contracts, `command(contract, payload)` and `answer(contract, handler, { everyProcess? })`. The raw `collect` and `send` stay until Phase 7 retires them.

- `request` and `collect` validate the request before sending and each answer on receipt. They return `{ status: "answered", data } | { status: "unavailable" } | { status: "failed", error }`. `unavailable` is decided by the bus from the subscriber set, so it is never inferred from an error string.
- `answer` parses the request and refuses an invalid one, then validates the handler's reply against the response schema before it leaves the handler's plugin. A reply that fails validation is a `failed` result at the sender and an error in the handler's log.
- Shell code uses the same calls through the bus it owns. No channel keeps a second, untyped path.

### Payloads that carry live objects stay on the bus

`publish:register` carries a provider object, and `site:build:staging` carries a `reportFailure` callback. The bus is in-process, so these are declared with `z.custom` guards in their contracts rather than moved to new shell registries. A shell registry for publishing would make shell know content-pipeline.

### Typed namespaces are rebuilt on contracts

`context.dashboard` and `context.studio` keep their methods, and their internals switch to contract calls, which retires their hand-rolled response handling. No new capability namespace is added in this plan. Contracts in `@brains/contracts` are the official surface for cross-plugin calls.

### Cross-package jobs get the same treatment

`defineJobContract({ type, input })` declares a job that another package may enqueue. `context.jobs.enqueue(contract, data)` validates the input against it, and `context.jobs.has(contract)` reports whether its owner is installed.

The image generation and render-source jobs become contracts. With that, shell's `base-generation-job-handler` and the social-media generator enqueue a declared contract instead of the string `image:image-generate`. `system_generate` asks `context.jobs.has` instead of hardcoding the `image` entity type.

### Dead surface is deleted, not typed

The 15 handler channels with no production sender, the ten sends with no subscriber, and the unused `BUTTONDOWN_CHANNELS` and `SOCIAL_CHANNELS` constants are removed in their own phase. Nothing is migrated that nothing uses.

### Scope boundary

The public `@rizom/brain` authoring SDK does not gain contracts in this plan. Exposing `defineBusContract` to external plugins is a separate decision after stable `v0.2.0`.

## Phases

Phases land as commits on one branch and PR, opened after the walking skeleton. Each phase leaves every channel either fully migrated or untouched.

### Phase 4 — Plugin channels with local or missing schemas

The three A2A channels, `sync:status:request`, `site:metadata:get`, the site-builder route, head-script and slot channels, `publish:register`, `publish-assets:register`, `generate:execute` and the generation reports, `playbooks:register-lifecycle-starter`, and `site:build:staging`. Each gets its contract in `@brains/contracts`, and each local schema copy is deleted.

### Phase 5 — Dashboard and Studio namespaces on contracts

The four dashboard and two Studio channels move behind contracts without changing the namespace methods.

### Phase 6 — Cross-package job contracts

`defineJobContract`, `context.jobs.enqueue(contract, …)` and `context.jobs.has`, with the image jobs and `system_generate` migrated.

### Phase 7 — Dead surface and the guard

Delete the unused handlers, sends and constants. Channel subscriptions refuse an invalid payload instead of answering `{ noop: true }`. Then add the guard: ESLint rejects `messaging.send` in entity, plugin and interface source unless it is a broadcast event, so any new cross-package call goes through a contract. `toMessageResponse` loses its cast.

Gate: no production `send` outside events remains, and `bun run arch:check` and full lint pass.

## Constraints

- Events stay events. Entity, conversation, sync and publish events keep `subscribe`/`observe` and their broadcast semantics; this plan types requests and commands only.
- Registration order must stop mattering for correctness. A `request` contract with two subscribers is a startup error, not a silent first-wins.
- Worker and web processes keep their current split: a contract answered only in the web process is `unavailable` in the worker, and every migrated sender handles `unavailable` explicitly.

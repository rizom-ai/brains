# Plan: Startup readiness signal — stop capturing default identity at boot

Last updated: 2026-07-22

## Status

Root-caused 2026-07-21; plan expanded 2026-07-22 to remove one-off event literal fixes.

## Problem

`SYSTEM_CHANNELS.pluginsRegistered` has the wire value `"system:plugins:ready"`
(`shell/plugins/src/system-channels.ts:10`). The bootloader broadcasts it right after
plugin registration — its real job is "registration done, start the initial
directory-sync import" — which is **before** `prepareReadyState()` loads the
brain-character and anchor-profile singletons from the entity DB
(`shellBootloader.boot()` order: `emitPluginsRegistered` → `prepareReadyState` →
`pluginManager.readyPlugins()`).

Consequences, verified live on `rizom.ai` at alpha.209:

- The atproto ambient publisher subscribed to the literal string believing the name.
  Its brain card publishes at registration time and captures identity defaults —
  `brain.name: "Brain"`, `role: "Knowledge assistant"`, `anchor.name: "Unknown"` —
  even though the content repo file, the DB row, and the parser all hold the real
  identity (`Rizom` / `Knowledge and presence coordinator…` / anchor `Rizom`,
  `collective`). Boot logs confirm the card's `createdAt` precedes initial-sync
  completion.
- Discovery captures such cards into reviewable `agent` entities, so dashboards
  across the fleet list peers as "Brain is X's Knowledge assistant". The dashboard is
  a faithful renderer of polluted upstream data, not a second bug site.
- At request time everything is correct — the live A2A agent card serves the real
  identity — so the only broken window is event-time capture during boot.

Roughly 20 other subscriber sites use the same literal for registration-time
cross-plugin handshakes (publish-pipeline provider registration, dashboard widget
registration, head-script registration, initial-sync kickoff). For them the early
timing is exactly right; only the name lies. None of them capture identity content.

There is a second design problem: fixing only this literal would be a one-off. The
message bus has many domain events (`publish:*`, `entity:*`, `dashboard:*`,
`atproto:*`, etc.) that are still stringly-typed at call sites. This slice should
establish the pattern that event names are owned by the domain that defines them,
not scattered as literals.

## Decisions

1. **System/lifecycle bus events are owned by `SYSTEM_CHANNELS`.** The first code
   step is to fix `SYSTEM_CHANNELS.pluginsRegistered` to use the honest wire value
   `"system:plugins:registered"`, convert all `system:*` lifecycle subscribers to
   the constant, and guard against hardcoded system lifecycle event strings in
   source.
2. **Domain events get domain-owned constants, not a dumping-ground system file.**
   Examples:
   - publish pipeline events live with publish pipeline contracts;
   - entity mutation events live with entity/service contracts;
   - dashboard/widget registration events live with dashboard/site composition
     contracts;
   - atproto ambient-publishing events live with the atproto package.
3. **No new post-ready bus event.** After the atproto move, no consumer needs an
   event-style post-ready broadcast. An unused `system:ready` channel would be the
   same trap this plan removes. Add one only when a real consumer appears.
4. **The atproto boot triggers move to the existing `Plugin.ready?()` lifecycle
   hook** (`shell/plugins/src/interfaces.ts`), which `readyPlugins()` dispatches
   after `prepareReadyState()`. This is the mechanism that already means "the brain
   is ready"; the plugin simply used the wrong one.
5. **Message-based entity-record triggers stay message-based, but not literal-based.**
   `publish:completed`, `entity:updated`, and `entity:deleted` already fire
   post-boot and keep their semantics; their names should be imported from their
   owning event contracts.

## Phases

### 1. Fix `SYSTEM_CHANNELS` first

Tests first:

- add a shell/plugins guard test that `SYSTEM_CHANNELS.pluginsRegistered` is
  `"system:plugins:registered"`;
- add a source guard for hardcoded `system:*` lifecycle bus event strings outside
  approved channel-definition files and docs/tests;
- update existing startup/order tests to use the constant rather than the old
  literal.

Implementation:

- change `SYSTEM_CHANNELS.pluginsRegistered` to `"system:plugins:registered"`;
- convert every source subscriber currently using the old literal to
  `SYSTEM_CHANNELS.pluginsRegistered` (shell/app brain-resolver head scripts;
  newsletter; social-media; wishlist; topics widgets; portfolio; decks;
  assessment; agent-discovery dashboards; blog; conversation-memory widgets;
  sites/rizom runtime; directory-sync already uses the constant);
- update comments/test names so they say "plugins registered" rather than
  "plugins ready" when referring to this event.

Exit gate: shell/plugins guard and startup/order tests green; no hardcoded
`system:*` lifecycle event literals in source.

### 2. Add domain-owned event constants for all message-bus events

Tests first:

- add/import small contract tests for each event namespace touched by current
  call sites;
- add repo/source guards that allow event string literals only in owning
  event-contract modules (and docs/tests), not in arbitrary subscribers/senders.

Implementation:

- inventory hardcoded message-bus event names in source;
- introduce or extend owning constants modules by domain, for example:
  - publish pipeline: `PUBLISH_CHANNELS` for `publish:register`,
    `publish:execute`, `publish:completed`, etc.;
  - entity service: `ENTITY_CHANNELS` for `entity:updated`, `entity:deleted`, etc.;
  - dashboard/site composition: `DASHBOARD_CHANNELS` for
    `dashboard:register-widget` and related events;
  - atproto: keep/extend exported constants such as `ATPROTO_PUBLISH_FAILED`;
- convert senders and subscribers to imports from their owning domains;
- do not move domain events into `SYSTEM_CHANNELS`.

Exit gate: event-contract tests and source guard green; no arbitrary hardcoded
message-bus event strings remain in source.

### 3. Move atproto boot triggers to `ready()`

Tests first, in `plugins/atproto/test/publishing-triggers.test.ts`:

- broadcasting the plugins-registered event does **not** publish the card;
- `await plugin.ready()` publishes the card (and lexicon schema records when
  `lexiconAuthority` is set) with identity read at call time — assert the record
  carries identity that was loaded _after_ registration;
- `ready()` without credentials is a silent no-op;
- failure isolation (`ATPROTO_PUBLISH_FAILED`) is preserved.

Implementation: `AtprotoPlugin` overrides `ready()` to run the card and
lexicon-schema triggers through the existing `runPublishingTrigger`/task-tracking
path; the bus subscription for the boot triggers is deleted.

Exit gate: atproto and contracts suites green; the card record in tests contains
post-registration identity.

### 4. Ship and remediate live data

- Release train, bump the sites cohort, deploy.
- Verify `at://did:plc:oehciuqunzskplljt3qnnncw/ai.rizom.brain.card/self` now
  carries `brain.name: "Rizom"`, the real role/purpose/values, and
  `anchor: { name: "Rizom", kind: "collective" }`; pdsls renders it schema-valid.
- Stale `agent` entities that captured default-identity cards heal on the next
  discovery run against republished cards. Other fleet brains pick the fix up with
  their next regular version bump — no forced fleet-wide redeploy for this alone.

## Verification

1. `SYSTEM_CHANNELS` tests prove the registration coordination event is honestly
   named and no `system:*` lifecycle literal is hardcoded in source.
2. Domain event-contract tests prove message-bus events are imported from owning
   packages rather than scattered string literals.
3. Boot-order/atproto tests prove the card cannot be built from pre-ready identity.
4. Full repo test + typecheck + lint pass. The alpha.204 baseline fixture captures
   config, not event names, so it is expected to be byte-identical — if it moves,
   record the delta per that plan's procedure before merging.
5. Live card record shows the authored identity after deploy.
6. A subsequent discovery pass shows `agent` entities with real names instead of
   "Brain / Knowledge assistant".

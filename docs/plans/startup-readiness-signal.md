# Plan: Startup readiness signal — stop capturing default identity at boot

Last updated: 2026-07-21

## Status

Root-caused 2026-07-21; not started.

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

## Decisions

1. **The atproto boot triggers move to the existing `Plugin.ready?()` lifecycle
   hook** (`shell/plugins/src/interfaces.ts`), which `readyPlugins()` dispatches
   after `prepareReadyState()`. This is the mechanism that already means "the brain
   is ready"; the plugin simply used the wrong one.
2. **No new bus event.** After the atproto move, no consumer needs an event-style
   post-ready broadcast. An unused `system:ready` channel would be the same trap
   this plan removes. Add one only when a real consumer appears.
3. **The wire value renames to `"system:plugins:registered"`** so that nothing in
   the system is named "ready" before ready exists. All literal subscribers convert
   to the `SYSTEM_CHANNELS.pluginsRegistered` constant; timing and semantics are
   unchanged for every one of them.
4. The entity-record triggers (`publish:completed`, `entity:updated`,
   `entity:deleted`) stay message-based — they already fire post-boot.

## Phases

### 1. Move atproto boot triggers to `ready()`

Tests first, in `plugins/atproto/test/publishing-triggers.test.ts`:

- broadcasting the registration event does **not** publish the card;
- `await plugin.ready()` publishes the card (and lexicon schema records when
  `lexiconAuthority` is set) with identity read at call time — assert the record
  carries identity that was loaded _after_ registration;
- `ready()` without credentials is a silent no-op;
- failure isolation (`atproto:publish:failed`) is preserved.

Implementation: `AtprotoPlugin` overrides `ready()` to run the card and
lexicon-schema triggers through the existing `runPublishingTrigger`/task-tracking
path; the bus subscription for the boot triggers is deleted.

Exit gate: atproto and contracts suites green; the card record in tests contains
post-registration identity.

### 2. Rename the lying channel

- Change `SYSTEM_CHANNELS.pluginsRegistered` to `"system:plugins:registered"`.
- Convert every subscriber currently using the literal string to the constant
  (shell/app brain-resolver head scripts; newsletter; social-media; wishlist;
  topics widgets; portfolio; decks; assessment; agent-discovery dashboards; blog;
  conversation-memory widgets).
- Add a guard test in `shell/plugins` asserting the retired literal
  `"system:plugins:ready"` appears nowhere in source (changelogs exempt), so the
  trap cannot quietly return.

Exit gate: full repo test + typecheck + lint; guard test green. The alpha.204
baseline fixture captures config, not event names, so it is expected to be
byte-identical — if it moves, record the delta per that plan's procedure before
merging.

### 3. Ship and remediate live data

- Release train, bump the sites cohort, deploy.
- Verify `at://did:plc:oehciuqunzskplljt3qnnncw/ai.rizom.brain.card/self` now
  carries `brain.name: "Rizom"`, the real role/purpose/values, and
  `anchor: { name: "Rizom", kind: "collective" }`; pdsls renders it schema-valid.
- Stale `agent` entities that captured default-identity cards heal on the next
  discovery run against republished cards. Other fleet brains pick the fix up with
  their next regular version bump — no forced fleet-wide redeploy for this alone.

## Verification

1. Boot-order test proves the card cannot be built from pre-ready identity.
2. Repo-wide guard test proves nothing subscribes to a "ready" name that fires at
   registration.
3. Live card record shows the authored identity after deploy.
4. A subsequent discovery pass shows `agent` entities with real names instead of
   "Brain / Knowledge assistant".

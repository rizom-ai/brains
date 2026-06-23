# Plan: Brain Model Unification — One Model, Capability Bundles

Last updated: 2026-06-23

## Status

Proposed. Design settled through a decision walk (June 2026); no implementation started. Supersedes the preset/three-reference-model framing of the retired `relay-presets.md` (its team-native capability roadmap moved to [team-posture-capabilities.md](./team-posture-capabilities.md)); overlaps the parked composition escape hatch in [custom-brain-definitions.md](./custom-brain-definitions.md), which should be reconciled against this plan once Phase 0 lands.

## Context

Today the product ships three named brain _models_ — `rover`, `relay`, `ranger` — as separate workspace packages (`brains/*/src/index.ts`). They are not three codebases; they are three `defineBrain()` configs over the same framework, differing in preset, identity, prompts, site/theme, and permission posture:

- **rover** (`@brains/rover`) — personal publishing; anchor-only permissions; default site/theme.
- **relay** (`@brains/relay`) — team memory; adds `conversation-memory` (`shared`) + `docs`; **trusted-collaborator** create/update posture; relay site / rizom theme.
- **ranger** (`@brains/ranger`) — community/org; adds `products`/`wishlist`/`social`/`atproto-registry`; rizom site/theme.

The product decision is to collapse the lineup to **one brain**, "truly one" — no model archetypes. The architecture already wants this: presets and `brain.yaml` `add`/`remove` exist precisely so one model can express many shapes, and roadmap §3 already treats trust/identity as shared substrate, "not Relay-specific."

The distinction the three models encode (personal vs team vs community) is real, but it is a _posture_ selected at deploy time, not a separate product. This plan makes posture a first-class, composable primitive.

## Decisions (settled)

1. **No archetypes.** `rover`/`relay`/`ranger` model packages all retire. Each deployed brain carries its own unique name/identity (already an instance property: `seed-content/` + `brain.yaml` `name:`).
2. **One canonical capability set, folded into `@rizom/brain`.** No surviving `brains/*` model package; the framework ships the default brain definition + bundles behind its authoring surface. `brain init` scaffolds an instance that picks bundles + a unique name.
3. **Capability bundles are the new composition primitive.** A bundle is a _named, posture-carrying_ group: plugins **+ their config defaults + permission posture**. Selecting `team` brings `conversation-memory` `shared` visibility _and_ the trusted-collaborator permissions as one unit.
4. **Bundle permissions are entity-type-scoped.** A bundle governs only the entity types it introduces, so combining bundles is conflict-free by construction. Merge rule: **an explicit bundle posture overrides the `core` default** (e.g. `team` loosens the core-owned `deck` from anchor to trusted); **most-restrictive-wins** only arbitrates genuine two-bundle conflicts (rare, since postures are entity-scoped); the per-instance `brain.yaml` override is the final say.
5. **Bundles are fixed, not parameterized.** A bundle's value is being a known, tested combination. Tuning lives at the edges: compose multiple bundles (up), or per-plugin `add`/`remove` + `plugins:` config overrides in `brain.yaml` (down). `publishing` without social = `bundles: [core, publishing]` + `remove: [social-media]`; removing a plugin drops its scoped permission entries with it. Recurring removals are a signal to re-cut the bundle, not to make bundles configurable.
6. **Presets retire in favor of bundles.** No runtime `core/default/full` ladder. `brain.yaml` composes `bundles:` directly. `brain init` _recipes_ (personal / team / community) provide the friendly on-ramp by expanding to explicit bundle lists in the generated file — onboarding sugar, not a runtime concept.
7. **`site` and `publishing` are distinct, independent axes.** Already proven by today's configs: relay = core + site (no publishing); ranger = core + site + commerce; only rover = core + site + publishing. Selecting `publishing` does **not** pull `site` — publishing can target external channels (email, LinkedIn, atproto, Discord) with no website.

## Bundle taxonomy

Membership rule for `core`: **posture-independence** — what a brain wants regardless of personal/team/community. A fat core is fine; anything unwanted is `remove`-able per instance.

- **`core`** — posture-independent foundation: infra (prompt, directory-sync, auth-service, notifications, mcp, webserver, a2a, dashboard, cms, email) + universal capture (note, link, topics, image, document, wishlist) + `decks` (deck entity + carousel/PDF rendering — universal knowledge-work output) + `agents`/`assessment` + atproto **discovery** (`atproto-registry`). Keeps the name `core`.
- **`site`** — public web presence: site-info, site-builder, site-content, theme wiring, web analytics, OG / dashboard-root.
- **`publishing`** — content production + distribution: post/blog, series, content-pipeline (engine + its schedules), social-media (incl. deck → LinkedIn document distribution via `social-post.documents[]`), newsletter, stock-photo, portfolio, atproto **outbound** publishing.
- **`team`** — conversation-memory (`shared`) + docs + trusted-collaborator permission posture (scoped to note/link/doc/deck/decision/action-item).

There is **no `community` bundle.** Ranger's only orphan capability is `products`; it is posture-independent (an independent professional can sell offerings just as an org can), so it becomes an **opt-in capability in no default bundle**, added per instance via `add: [products]`. Everything else ranger had already maps onto `core`/`site`/`publishing`, so ranger dissolves with no remainder.

Old archetypes map to bundle combinations:

- rover ≈ `core + site + publishing`
- relay ≈ `core + site + team`
- ranger ≈ `core + site` (+ `add: [products]` if commerce is wanted)

## Open questions

None blocking. `products` placement is settled (opt-in capability, no bundle); verify no live instance hard-depends on a ranger-only plugin before deleting `@brains/ranger` in Phase 3.

## Relationship to multi-user (out of scope)

The `team` bundle ships a **permission posture** — it loosens writes to the `trusted` _level_. That is a permission tier, not a roster of distinct people, and it works on today's single-anchor model.

**True multi-user** — each person a first-class runtime identity with their own auth, roles, per-user state, and cross-interface identity linking — is _substrate_, not a capability bundle. It forces a real architectural puzzle: content is markdown/git-synced and shareable, but user identity/auth must **not** be git-synced, so multi-user needs a second data plane (runtime DB) beside the content plane. That work lives in roadmap §3 (`multi-user.md`, `auth-runtime-db.md`, `operator-runtime-db.md`), not here.

This refactor's only obligation toward multi-user is to **not contradict it**: `team` is the permission-layer expression that real multi-user will later populate with distinct users. The two are parallel tracks and must not be jammed together.

## Phasing

Thin vertical slices: each phase is a brain that boots and stays eval-green. Tests are written first. The riskiest mechanism (posture-carrying bundles + permission merge) is proven early, against a real migration; the big physical move (folding into `@rizom/brain`) is last, once the bundle set is settled.

### Phase 0 — Walking skeleton: the bundle primitive

Introduce `defineBundle`; teach `defineBrain` to accept and resolve `bundles` — union plugin lists, merge config, merge permissions (most-restrictive-wins, entity-type-scoped). Prove by expressing **only rover's `core`** as one bundle; the rest of rover stays a raw capability list. Rover boots byte-identically; full eval suite unchanged.

- Tests first: bundle-resolution unit tests (union, config merge, permission merge incl. overlap rule); existing rover evals as regression gate.

### Phase 1 — Rover as bundles (`core` + `site` + `publishing`)

Split rover's remaining capabilities into `site` and `publishing`; rover composes the three. Boots identically, full suite green. Proves multi-bundle composition and the site/publishing split on the richest model. (`decks` lands in `core`; deck → LinkedIn distribution stays in `publishing` via social-media.)

- Tests first: composition test asserting the three bundles reproduce today's rover plugin set + permissions; eval suite as regression.

### Phase 2 — `team` bundle (migrate Relay) — keystone

Introduce `team` (conversation-memory `shared` + docs + trusted-collaborator posture scoped to its entity types: note/link/doc/deck/decision/action-item). Express relay as `core + site + team`. **This phase actually exercises posture-carrying bundles**: `team` explicitly loosens the core-owned `deck` (and core capture types) from anchor to trusted — the "explicit bundle posture overrides core default" merge rule. Migrate relay's conversation-memory/team eval fixtures into the suite, tagged by bundle. Retire `@brains/relay`.

- Tests first: permission-merge tests (team loosening core defaults; the override precedence); relay's re-tagged team-memory/attribution/trust evals pass against `core + site + team`.

### Phase 3 — Dissolve Ranger

No new bundle. Make `products` an opt-in capability (in no default bundle). Express ranger as `core + site` (+ `add: [products]` if its instance sells anything). Verify no live instance hard-depends on a ranger-only plugin, then retire `@brains/ranger`.

- Tests first: ranger's test-cases re-tagged and green against `core + site` (+ products where used).

### Phase 4 — Retire presets, add `brain init` recipes

Remove the `core/default/full` preset path from resolution; `brain.yaml` composes `bundles:` directly with instance `add`/`remove` on top. `brain init` gains recipes (personal / team / community) expanding to explicit `bundles:` lists. Convert the preset-aware eval harness (`--preset` → bundle-combination boot).

- Tests first: init-scaffolding tests (recipes expand to the right bundle lists); eval-harness tests for bundle-combination boot.

### Phase 5 — Fold the model into `@rizom/brain`; delete archetype packages

Move the canonical capability set + bundle definitions behind `@rizom/brain`'s authoring surface. Delete `brains/rover` (relay/ranger already gone). `brain init` default points at the folded-in definition. Update known references: `shell/ai-service/src/agent-types.ts`, `shell/app/test/instance-overrides.test.ts`, `shell/app/test/site-package-structure.test.ts`, the eval test-runner, deploy paths.

- Tests first: app-boot + instance-override tests against the framework-hosted definition.

### Phase 6 — Docs & roadmap rewrite

`docs/brain-model.md` (remove the three-reference-models section; document bundles + model/instance), roadmap §1/§2 collapse into one product track with the personal→collective arc, plus `README`/`AGENTS.md`/`architecture-overview`/`theming-guide` references and a changeset. (`relay-presets.md` already retired; reconcile `custom-brain-definitions.md`.)

## Checkpoints

Phases 0–2 are the spine. End of Phase 2 is the natural reassessment point: the architecture is proven against two genuinely different postures (anchor-only personal, trusted-collaborator team) before any irreversible package deletion or framework fold.

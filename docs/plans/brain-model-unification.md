# Plan: Brain Model Unification — One Brain, Capability Bundles

Last updated: 2026-08-10

## Status

The one-brain runtime shipped. PR #73 merged it, removed the Rover/Relay/Ranger packages
and the preset contract, and published `@rizom/brain`, `@rizom/ops`, and `@rizom/ui` at
`0.2.0-alpha.244`. No runtime preset or built-in model registry remains, and no archetype
package is required to build, boot, evaluate, initialize, or deploy a brain. That work is
done and is not restated here.

Two things are open.

**The bundle taxonomy is being replaced.** The shipped runtime composes from four bundles
— `core`, `site`, `publishing`, `team` — where `core` is a 29-member unit fusing runtime
foundation, universal entity types, discovery, and every I/O surface. It cannot express a
brain without a webserver, without a chat interface, or without any individual entity
type; the only escape is `remove:` lists, the anti-pattern bundles were introduced to
eliminate. This plan now targets nine capability bundles plus one policy bundle. Because
`v0.2.0` exists to freeze the composition contract, the taxonomy lands **before** stable,
not after: certifying a contract already scheduled for replacement would force every
deployed brain to migrate `bundles:` twice.

**The crossover has not executed.** An operator-approved branch canary exercised
`0.2.0-alpha.244` on `jo` and `smoke`; both coherent config/image pairs passed exact
version, health, unauthenticated MCP, site, and CMS checks. The crossover then stopped at
the post-deploy convergence gate: deploy finalization rendered live status into
`views/users.md`, while `reconcile-all` would rewrite that observational view with
non-observed status. Both canaries were rolled back as coherent pairs to
`0.2.0-alpha.239` and verified healthy. The private pilot remains on its prior legacy
desired-state contract, and normal Build, Reconcile, and Deploy automation is restored.

Unification remains a **pre-`v0.2.0` release-candidate gate**.

This plan supersedes the preset framing of the retired `relay-presets.md` and
`custom-brain-definitions.md`. Team-native product work remains in
[team-posture-capabilities.md](./team-posture-capabilities.md); multi-user identity
shipped and is documented in the
[`auth-service` implementation guide](../../shell/auth-service/README.md).

## Goal

Replace the four-bundle taxonomy with one that composes cleanly, then cross the fleet over
and cut stable `0.2.0` from that contract.

Success means:

- `bundles: [core]` boots a working headless brain with no HTTP listener;
- every posture from headless to team is reachable by bundle selection without `remove:`;
- plugin maturity is expressed by recipe selection, never by bundle membership;
- the agent card is owned by `core` and published by whichever channel bundles are active;
- checked-in apps and hosted pilot desired state use the new bundles, and a second
  reconcile produces no generated drift;
- the fleet and `yeehaa.io` are healthy on one nominated unified alpha before Changesets
  exits prerelease mode.

## Settled decisions

1. **One canonical brain.** Rover, Relay, and Ranger are retired. There is no model
   registry and no archetype package.
2. **Catalog and selection are separate.** The canonical catalog owns factories and base
   config. Bundles select catalog IDs and contribute bounded config, instruction, eval,
   and permission defaults. A selected capability is instantiated once even if multiple
   bundles reference it.
3. **Bundles are fixed and named.** Runtime bundles are `core`, `media`, `automation`,
   `web`, `chat`, `site`, `publishing`, `federation`, and the policy-only `team`. They are
   not parameterized. Instance tuning remains `add`, `remove`, and `plugins` config.
4. **Recipes are scaffolding only.** The five recipes — `headless`, `personal`,
   `professional`, `team`, `commerce` — expand to explicit `bundles:` plus
   site/theme/seed defaults. No `recipe:` field is stored or interpreted at runtime.
5. **Core needs nothing external.** Every core member works with no inbound listener and
   no third-party account. Anything requiring a listener, an external service
   relationship, or a product opinion is layered above it.
6. **Maturity is a recipe concern.** A plugin that is not ready is omitted from a recipe,
   never relocated to a different bundle. Relocation would force member migration and
   re-resolution when it stabilizes.
7. **Posture is policy, not capability.** `team` owns no members. It contributes config,
   permissions, and instructions over members owned by other bundles.
8. **Site and publishing remain independent.** A publisher may target external channels
   without a site; a site may exist without the publishing stack.
9. **Identity is instance-owned.** Name, anchor profile, brain character, seed content,
   site package, and theme are instance/recipe inputs, not hidden bundle identity.
10. **Removal closes all attached defaults.** A removed member receives no bundle config,
    eval, route-permission, or entity-action contribution.
11. **YAML order has no policy meaning.** Bundle definition order controls deterministic
    composition. User list order cannot change config or permissions.
12. **The crossover is clean.** No runtime loader, registry, renderer, or reconciler
    accepts both the legacy and canonical contracts. Repository runtime selection,
    checked-in configs, published artifacts, and pilot desired state cross over in one
    operator-approved window. Rollback restores the prior config revision and prior image
    together; it is not forward dual-format compatibility.
13. **Hosted package versions are explicit at crossover.** Every external site and theme
    package is pinned to an exact reviewed version in the staged desired state. Missing
    pins fail schema validation before registry loading.
14. **Unification gates stable `v0.2.0`.** The obsolete composition contract must not be
    the contract certified by the release candidate.

## Target bundle taxonomy

`core` states what a brain _is_; every human surface, storage requirement, and posture
opinion sits in a bundle above it. Declaration order is significant — a bundle may only
override an earlier one.

| #   | Bundle       | Members                                                                                           |
| --- | ------------ | ------------------------------------------------------------------------------------------------- |
| 1   | `core`       | profile, prompt, style-guide, directory-sync, note, link, topics, unified-inbox, mcp, a2a, agents |
| 2   | `media`      | document, image                                                                                   |
| 3   | `automation` | playbook, playbooks, onboarding                                                                   |
| 4   | `web`        | webserver, auth-service, account, admin, dashboard, cms                                           |
| 5   | `chat`       | chat, web-chat, email, notifications, conversation-memory                                         |
| 6   | `site`       | site-info, site-content, site-builder, analytics                                                  |
| 7   | `publishing` | blog, series, portfolio, decks, content-pipeline, social-media, newsletter, stock-photo           |
| 8   | `federation` | atproto, atproto-registry                                                                         |
| 9   | `team`       | _(policy only — owns no members)_                                                                 |

### Bundle rationale

`core` is an identity (profile, prompt, style-guide), a markdown vault (directory-sync),
the universal knowledge atoms (note, link, topics), the operator inbox (unified-inbox),
and the three machine protocols that need no third-party account (mcp, a2a, agents). It is
outbound-complete and inbound-free: a `[core]` brain can call peers and fetch their agent
cards, but serves nothing and cannot be discovered.

`media` is the storage-backed types, separated because binary assets carry their own
durability requirements.

`web` is the HTTP layer and everything needing a listener. It is the prerequisite for
`site` and the channel through which the agent card becomes publicly fetchable.

`chat` is every conversational surface — Discord/Slack, web chat, email, and the
notifications that need a delivery channel — plus `conversation-memory`, which is fed by
whatever produces conversations rather than by any one interface.

`site` is the public web presence. No site package, theme, or identity is hard-coded.

`publishing` is content production and distribution.

`federation` is ATProto identity, brain-card publishing, and lexicon tooling. It is the
one discovery channel requiring no inbound listener, because publishing a brain card is an
outbound write to a PDS the brain does not host. `[core, federation]` is therefore the
headless-but-discoverable posture.

`team` owns no members. It contributes shared conversation-memory visibility, trusted
collaborative write grants, and instruction fragments over members owned by other bundles.

### Card ownership

`core` owns the canonical agent card — `a2a` builds it from identity, profile, profile
kind, and public skill entities. Bundles own the publication channels:

- `web` serves `/.well-known/agent-card.json` and `/.well-known/agent-directory.json`;
- `federation` writes it to a PDS as an `ai.rizom.brain.card` record.

A brain with neither channel has a card nobody can fetch, which is the correct meaning of
headless and private.

### Inbox ownership

The same split applies to "what came in that needs me?". `core` owns the projection —
`unified-inbox` aggregates whatever `InboxSource`s are registered, over a registry that
already lives at shell level in `shell/plugins/src/inbox-registry.ts`. Bundles own the
renderings:

- `web` renders the dashboard widget;
- `chat` delivers the daily digest through notifications.

This demotes notifications from being _the_ surface for things needing attention to being
_a_ delivery channel for them. `shell/recurring-checks` models `RecurringAlert` and
`RecurringCheckResult` as durable Inbox attention independently of notification delivery,
which lives in `chat`; scheduled-work failures therefore remain visible to a headless
brain.

Two things follow, and both are prerequisites for core membership rather than
consequences of it:

- **The inbox needs a tool.** It is a live projection, not entities, so the framework
  `system_*` tools cannot read it — `system_list` only sees the entity database. Without a
  dedicated tool there is no way for a `[core]` brain to ask the question the capability
  is named after.
- **The inbox needs a core source.** Exactly one `InboxSource` is registered anywhere
  today: `email-workflows`'s, which is an opt-in needing the `email` interface from `chat`.
  Shipping core membership without a core-owned source would produce an inbox that is
  empty by construction rather than empty by circumstance.

Recurring-check alerts are the first source because they are shell-level and therefore
present in every brain regardless of selection. directory-sync import issues are the
natural second: `importFile` already records an operation-status issue when it skips an
oversized file, and that issue currently has no operator surface. agent-discovery's
pending-approval queue and inbound A2A tasks from unapproved peers are later candidates.

### Contributions

| Bundle       | Config                                                                                                     | Permissions                                                                                           | Eval exclusions       |
| ------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------- |
| _definition_ | —                                                                                                          | `"*": admin` entity actions; `cli:* → admin`; `mcp:stdio → admin`                                     | —                     |
| `core`       | —                                                                                                          | —                                                                                                     | mcp                   |
| `web`        | dashboard `{routePath: "/"}`                                                                               | `mcp:http → public`                                                                                   | webserver, dashboard  |
| `chat`       | —                                                                                                          | `discord:* → public`; `web-chat:* → admin`                                                            | chat, web-chat, email |
| `site`       | dashboard `{routePath: "/dashboard"}` overriding `web`                                                     | —                                                                                                     | analytics             |
| `publishing` | content-pipeline schedules/conditions; newsletter `doubleOptIn`                                            | —                                                                                                     | —                     |
| `federation` | —                                                                                                          | —                                                                                                     | atproto               |
| `team`       | conversation-memory `{memoryVisibility: "shared"}`; topics `{extractableStatuses: ["published", "draft"]}` | trusted create/update on note, link, image, decision, action-item, doc; `mcp:http → admin` over `web` | —                     |

The platform permission baseline moves out of `core` onto the definition itself, because
it is posture-independent and must hold for `bundles: [core]` regardless of which bundles
attach policy above it. Bundles may only widen it.

`publishing` and `team` additionally contribute their agent instruction fragments.

### Explicit opt-ins

These stay outside default bundles unless a new product decision is recorded:

- products;
- obsidian-vault;
- docs;
- wishlist;
- assessment (SWOT);
- email-workflows;
- low-level chat adapter surfaces not selected by the built-in interfaces;
- opportunity-prioritization;
- LinkedIn import and the managed OAuth broker;
- custom/external plugin packages.

### Recipe output

Recipes form a ladder of postures. The axis is what the brain is for, not how large it is:
`headless` has no surface at all, `personal` has surfaces but no public face, and
`professional` adds public presence and the publishing stack.

| Recipe         | Generated runtime selection                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `headless`     | `bundles: [core]`                                                                                                       |
| `personal`     | `bundles: [core, media, web, chat]`                                                                                     |
| `professional` | `bundles: [core, media, automation, web, chat, site, publishing, federation]` plus professional site/theme/seed content |
| `team`         | `bundles: [core, media, automation, web, chat, site, team]`, `add: [docs]`, plus team site/theme/seed content           |
| `commerce`     | `bundles: [core, media, web, site]`, `add: [products]`, plus commerce site/theme/seed content                           |

`personal` is a private brain with a console: capture, chat, browser administration, and
conversation memory, with no public presence. It omits `automation` on maturity grounds.

Recipe names and profile kinds share the word `professional` but describe different axes.
`kind` describes the anchor profile's schema — the fields a person, team, or organization
profile carries — and the built-in kinds are `professional`, `team`, and `organization`.
There is no `personal` kind, so both the `personal` and `professional` recipes set
`kind: professional`. That asymmetry is cosmetic and must not be resolved by inventing a
`personal` profile kind.

Recipes may generate explicit additions, but those additions must be visible in
`brain.yaml`; recipes cannot create hidden runtime variants.

## Resolver changes required

The taxonomy cannot be expressed by the shipped resolver. The bundle kernel, deterministic
composition, override ordering, and the `defineBundle` contract are reused unchanged; the
following are additive.

1. **Definition-level baseline permissions.** `BrainDefinition.permissions` exists and is
   unused by the canonical definition. The `"*": admin` baseline and the `cli:*` /
   `mcp:stdio` rules move there. Without this, a slim `core` loses the admin-only baseline,
   because the `admin` member now lives in `web` and the `cli:*` rule is attached to it.
2. **Resolver-derived MCP transport.** MCP defaults to HTTP and throws when HTTP is
   selected without the webserver interface, so `bundles: [core]` fails at init once
   `webserver` leaves `core`. Derive `transport` from webserver presence in
   `applyPluginDefaults`, alongside the existing `enablePreview` default. An explicit
   `plugins.mcp.transport` in `brain.yaml` continues to win.
3. **Unscoped policy contributions.** Config, permission, and eval contributions are
   rejected unless the contributing bundle owns the member. `team` owns nothing, `web`
   contributes to `mcp`, and `site` excludes `dashboard` — none are expressible today.
   `team` cannot exist without this change. Validation must still reject contributions to
   members absent from the catalog, and conflicting contributions still require an explicit
   `overrides`.
4. **Channel-dependent card fields.** The A2A card and the brain card draw on the same
   identity, profile, and public-skill sources but duplicate the skill extraction and
   drift: the A2A card falls back to public tools when no skill entities exist while the
   brain card returns an empty list, and the brain card truncates at 100 skills. Share one
   extraction, and make `siteUrl` and DID derivation channel-dependent rather than
   mandatory — `siteUrl` describes the web channel, not the brain. Until this lands,
   `[core, federation]` publishes nothing.

Wanted but separable: bundle-level `requires`, wired to the plugin `dependencies` field
that is declared and never read in the selection path. Without it, `bundles: [site]` alone
resolves cleanly into a brain registering routes nothing serves. The prerequisites would be
`site → web`, `publishing → site, media`, and `team → chat, media`.

## Phasing

Each phase is a vertical slice that ships resolvable behavior with its tests, and each
begins with the failing test that defines it.

### Phase 1 — Definition-level permission baseline

Move the platform baseline from the `core` bundle to `BrainDefinition.permissions`. Prove
the effective policy for every current bundle selection is byte-identical before and
after, and that a selection excluding the `admin` member still yields the admin-only
baseline.

### Phase 2 — Resolver-derived MCP transport

Derive `transport` from webserver presence in `applyPluginDefaults`. Tests: a selection
without `webserver` resolves stdio and boots; a selection with it resolves HTTP; an
explicit `plugins.mcp.transport` overrides both. Remove the dead `dashboard-root` defaults
in the same pass.

### Phase 3 — Unscoped policy contributions

Allow config, permission, and eval contributions to target any catalog member. Tests: a
policy-only bundle with zero members contributes valid policy; contributions to unknown
members still fail validation; conflicting contributions without an explicit `overrides`
still fail; a contribution to an inactive member is absent from the resolution.

### Phase 4 — Define the new bundles alongside the old

Add the nine bundle definitions to the canonical definition without changing any
selection. Tests assert the exact resolved member set, config, permissions, instructions,
and eval exclusions for each recipe selection. This is where the taxonomy is proven
correct while the shipped contract still runs.

### Phase 5 — Walking skeleton: boot headless

Select `bundles: [core]` in a test app and prove it boots with no HTTP listener, exposes
MCP over stdio, syncs its vault, and answers a tool call. This is the first proof the
split is real rather than structural.

### Phase 6 — Make the inbox answerable headless

Core membership for `unified-inbox` is only meaningful if a `[core]` brain can both ask
the question and get a non-empty answer. Ship both halves together:

- an inbox tool, so the projection is reachable over MCP stdio without a dashboard;
- recurring-check alerts as the first `InboxSource`, re-pointing
  `shell/recurring-checks` at the inbox and leaving notification delivery as one channel
  rather than the only surface.

Tests: a `[core]` brain answers the inbox tool with an empty result when no sources are
registered; a failing recurring check appears as an inbox item over stdio with no
webserver and no notification channel present; adding `chat` delivers the same item as a
notification without duplicating it in the projection.

directory-sync import issues follow as the second source once the in-flight
[directory-sync-import-load.md](./directory-sync-import-load.md) work lands, since
`importFile` already records the operation-status issue that has no operator surface
today.

Both halves are implemented as Phases 7 and 8 of the inbox plan, which also records
that the CMS workspace and Dashboard widget are `web` renderings and the digest is a
`chat` delivery. This phase retains only the bundle-side gate.

### Phase 7 — Restructure the eval suites

`packages/brain-cli/brain.eval.yaml` declares five suites whose selections, names,
inheritance chain, and seed directories each encode the old taxonomy. Re-pointing the
`bundles:` lists is the smallest part of this.

- **Rename to the recipe ladder.** Today's suites are `core`, `personal`, `publishing`,
  `team`, `commerce`. `core` becomes `headless`, and today's `personal` becomes
  `professional`. Note that `personal` and `publishing` currently declare identical bundle
  lists and differ only by seed content and tags, so they collapse unless a distinct
  posture is defined for each. Because the name `personal` is then reused for a smaller
  posture, the rename must be explicit; mapping old suite names to new ones mechanically
  would silently change what is being evaluated.
- **Re-point the `extends` chain** at the ladder: `personal` extends `headless`,
  `professional` extends `personal`, `team` and `commerce` extend `personal`.
- **Reconcile seed content with membership.** `eval-content/core` seeds `image` and `link`
  entities, but `image` moves to `media`. `eval-content/team` seeds `swot`, `doc`, `deck`,
  and `prompt`, of which `assessment` and `docs` become opt-ins and `decks` belongs to
  `publishing`. Each suite must select the owning bundle, add the member explicitly, or
  drop the content. Seeding an entity type whose plugin is not registered must fail loudly
  rather than import silently.
- **Decide what evaluating a surface bundle means.** Eval exclusions now spread across
  `core`, `web`, and `chat`, so a `personal` suite running in `mode: eval` would have most
  of what distinguishes it from `headless` disabled. Either the exclusions narrow, or that
  suite asserts resolution and startup rather than model behavior.

Tests: each suite resolves to its intended member set; every entity type seeded in a
suite's content directory is registered by that suite's selection; a suite seeding an
unregistered type fails.

### Phase 8 — Flip the contract

Replace the four bundle definitions with the nine, update every checked-in app to the new
selections, and update `brain config migrate` so legacy presets emit the new bundle lists.
Prove migration is idempotent and that a migrated config resolves to the same effective
plugin set as its pre-migration equivalent, member for member, with any intentional
difference recorded explicitly.

### Phase 9 — Unify the cards

Share one public-skill extraction between the A2A card and the brain card, and make
`siteUrl` and DID derivation channel-dependent. Tests: the two cards agree on skills for
brains with and without skill entities; `[core, federation]` publishes a valid brain card
with no site; `[core, federation, web, site]` publishes one with a site URL.

### Phase 10 — Release the ops convergence fix

Independent of the taxonomy and already required:

1. Keep `views/users.md` under the explicit users-table rendering path; reconciliation must
   not overwrite observational status.
2. Have `reconcile-all --dry-run` print both changed-file lists so operator evidence never
   depends on private diagnostic scripts.
3. Test post-render reconciliation, two-pass convergence, blocked external access, and
   input preservation.
4. Publish the corrected `@rizom/ops` alpha, then regenerate staging from a freshly fetched
   pilot tip. Evidence from any earlier source revision certifies nothing.

### Phase 11 — Execute the crossover and certify

Only in an explicitly authorized maintenance window:

1. Freeze pilot reconciliation, deploy automation, and unrelated releases.
2. Verify the unified runtime and matching `@rizom/ops` artifact through package,
   declaration, packed-startup, and registry-integrity checks.
3. Apply the reviewed desired-state revision on an isolated canary branch with exact
   artifact pins. The ops loader reads only the canonical schema.
4. Build and record immutable image digests before deployment.
5. Deploy each approved instance as one coherent config/image unit. Existing instances stay
   on the old config and old image until their turn; never pair either side with the other
   contract.
6. Verify `/health/operate` version/status, expected unauthenticated MCP `401`, identity,
   repository/secret selectors, and application-managed site output after each deploy. Site
   evidence must come from a fresh rebuild on the running app rather than a persisted
   pre-deploy `dist`. Render observed fleet status separately after these probes.
7. Run a second reconcile and require zero drift in reconciler-owned generated config
   before lifting the freeze. `views/users.md` is not a reconciler-owned output.
8. If any gate fails, restore the prior desired-state revision and prior image together,
   then verify convergence with the prior ops release.

After convergence: run the `headless`, `personal`, `professional`, `team`, and `commerce`
eval suites only with explicit operator authorization; soak `jo` and `smoke`; validate
`yeehaa.io`; confirm no deployed config uses the old bundle names; then nominate the
deployed alpha as the stable `0.2.0` release candidate.

## Validation gates

Every phase runs the lightest relevant checks first, then broader checks when shared
contracts move:

- targeted `shell/app`, `packages/brain-cli`, affected posture, and `@rizom/ops` tests;
- typecheck and root-wrapper lint for affected workspaces;
- formatting and docs checks when docs or manifests change;
- public API/declaration checks when package surfaces move;
- architecture/dependency/workspace/env-schema checks when package ownership changes;
- packaged consumer and external-plugin startup smokes before deleting compatibility;
- generated pilot convergence, config/image pairing checks, paired rollback rehearsal, and
  live app-managed site rebuilds for deployed postures.

Composition parity is tested structurally. Model evals validate behavior at explicit
checkpoints; they are not a substitute for deterministic resolver tests and are not run
without operator authorization.

## Completion criteria

- one canonical definition, nine capability bundles, and one policy bundle remain;
- `bundles: [core]` boots headless and is covered by a startup test;
- headless, personal, professional, team, commerce, and external-plugin fixtures resolve
  from explicit bundles and additions;
- no checked-in config or desired-state file references `core`/`site`/`publishing`/`team`
  as the whole taxonomy;
- configuration migration is documented and proven idempotent;
- the active ops/runtime surface exposes only the canonical contract;
- unified canaries and `yeehaa.io` are healthy on the nominated alpha;
- the roadmap and authoring/deploy docs describe only the current bundle model;
- stable `0.2.0` is cut from that contract.

## Non-goals

- Adding opportunity prioritization, LinkedIn import, OAuth broker, web search, or team
  product features to a default bundle merely because their branches exist.
- Inventing a `personal` profile kind for naming symmetry with the `personal` recipe.
- Making bundles runtime-mutable after boot.
- Hiding instance site, theme, identity, or seed choices inside bundle code.
- Replacing Zod schemas, plugin lifecycle ownership, or Promise-based public APIs.
- Splitting the ATProto plugin into identity/discovery and outbound publishing. That seam
  is real — brain-card discovery is what would populate the agent directory — but it is a
  federation-posture decision, not a bundle one.

## Risks and controls

- **Two breaking migrations.** Shipping stable on the four-bundle contract and replacing it
  afterwards would migrate every brain's `bundles:` twice. Controlled by landing the
  taxonomy before the release candidate.
- **Silently broken selections.** A slim `core` makes `bundles: [site]` resolvable into a
  brain serving nothing, because bundle prerequisites are unexpressible. Controlled by
  Phase 4 recipe tests until `requires` lands.
- **Accidental permission widening.** The baseline moves to the definition while grants
  spread across more bundles. Controlled by full effective-policy snapshots in Phase 1 and
  Phase 8.
- **Eval suites certifying the wrong posture.** Suite names are reused with changed
  meaning — today's `personal` becomes `professional`, and `personal` is rebound to a
  smaller posture. Controlled by the explicit rename and per-suite member-set assertions in
  Phase 7.
- **Core members that are inert by construction.** A capability promoted into `core`
  without a core-level reader or producer looks composed but does nothing — the inbox is
  the first case, and would ship structurally empty if its tool and first source did not
  land with it. Controlled by pairing every core promotion with the reader and producer
  that make it answerable, as Phase 6 does.
- **Maturity leaking into membership.** Pressure to move an unstable plugin to a
  lower-traffic bundle instead of dropping it from a recipe. Controlled by settled decision 6.
- **Config drift hidden by unions.** Arrays never merge generically; posture-sensitive
  capabilities own typed composition.

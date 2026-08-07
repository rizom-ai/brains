# Plan: Brain Model Unification — One Brain, Capability Bundles

Last updated: 2026-08-03

## Status

Phases 0 through 7 are complete. PR #73 merged the one-brain runtime, removed the
Rover/Relay/Ranger packages and preset contract, and preserved the evaluated feature tip
through a merge commit. The exact merged runtime passed 219/221 authoritative model evals
and 221/221 with one bounded rerun of each initial efficiency-only failure. The corrected
release pipeline published `@rizom/brain`, `@rizom/ops`, and `@rizom/ui` at
`0.2.0-alpha.244`.

Phase 8 remains open. An operator-approved branch canary exercised canonical
`0.2.0-alpha.244` on only `jo` and `smoke`; both coherent config/image pairs passed exact
version, health, unauthenticated MCP, site, and CMS checks. The crossover then stopped at
the post-deploy convergence gate: deploy finalization rendered live status into
`views/users.md`, while `reconcile-all` would rewrite that observational view with
non-observed status. The canaries were rolled back as coherent pairs to their prior
`0.2.0-alpha.239` images and verified healthy. The private pilot remains on its prior
legacy desired-state contract, and normal Build, Reconcile, and Deploy automation is
restored.

The next gate is a released `@rizom/ops` correction, not another deployment workaround:

- the explicit users-table rendering path owns the observational `views/users.md`
  projection; desired-state reconciliation owns generated per-user config and must not
  rewrite that view;
- `reconcile-all --dry-run` reports the changed file paths from both passes directly;
- regression coverage proves that rendering observed status followed by reconciliation
  produces zero reconciler-owned drift;
- after the fix is published, crossover staging is regenerated from the then-current
  pilot tip and canary deployment restarts from immutable artifacts and paired rollback
  evidence.

No released runtime or active ops loader supports both the legacy and canonical
contracts. Unification remains a **pre-`v0.2.0` release-candidate gate** until the clean
crossover, canary soak, `yeehaa.io` validation, and stable release complete.

This plan supersedes the preset/three-reference-model framing of the retired
`relay-presets.md` and the retired `custom-brain-definitions.md`. Team-native product work
remains in [team-posture-capabilities.md](./team-posture-capabilities.md); real multi-user
identity shipped and is documented in the
[`auth-service` implementation guide](../../shell/auth-service/README.md).

## Goal

Ship one canonical brain through `@rizom/brain`, composed at deploy time from fixed
capability bundles. Retire the `@brains/rover`, `@brains/relay`, and `@brains/ranger`
model packages and the runtime `core` / `default` / `full` preset ladder without losing
any deployed posture, instance override, plugin package, permission boundary, site, seed
content, or eval fixture.

Success means:

- new instances select explicit `bundles:` and do not select a model or preset;
- personal publishing, team memory, and commerce configurations all boot from the same
  canonical definition;
- bundle membership, config, instruction, and permission contributions resolve
  deterministically and are independent of YAML list order;
- `add`, `remove`, `plugins`, external package declarations, local site/theme/content
  conventions, and instance permission overrides retain their current behavior;
- hosted pilot desired state and standalone apps have reviewed migration diffs before
  legacy support is deleted, then switch with the canonical runtime in one coordinated
  crossover window;
- the unified alpha is validated on all supported posture fixtures and hosted canaries;
- only then is a stable `0.2.0` release candidate nominated.

## Current baseline

### Runtime composition

Today `BrainDefinition` owns one catalog of capability/interface tuples plus optional
presets. `brain.yaml` selects a `brain:` package and a preset, then applies `add`,
`remove`, plugin config, site/theme, and permission overrides. The resolver:

1. chooses the preset;
2. unions `add` and applies `remove`;
3. evaluates capability config callbacks with `{ preset }`;
4. deep-merges per-instance plugin config;
5. creates fresh plugin/interface instances;
6. merges platform, active-plugin, model, and instance permission policies.

The packaged CLI statically registers Rover, Relay, and Ranger, bundles three env schemas,
and normalizes short names such as `rover` to `@brains/rover`. The monorepo runner imports
the package named by `brain.yaml` directly.

### Current posture shapes

The following is the migration baseline, not the target taxonomy:

| Current shape             | Important behavior that must be preserved or changed explicitly                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rover `core`              | profile extension, universal capture, directory sync, outbound ATProto, discovery/assessment, auth/notifications, playbooks/onboarding, CMS, root dashboard, MCP/webserver/web-chat/Discord/A2A |
| Rover `default`           | replaces the root dashboard with the site dashboard and adds blog, decks, analytics, Obsidian, site-info, and site-builder                                                                      |
| Rover `full`              | adds series, portfolio, content-pipeline, social, newsletter, and stock-photo                                                                                                                   |
| Relay `core/default/full` | team instructions, Relay seed content/site/theme, conversation-memory `shared`, trusted collaborator writes, team-specific topics config, optional docs/decks                                   |
| Ranger `default`          | organization site, products, social, wishlist, ATProto registry, and public-facing permissions                                                                                                  |
| Instance additions        | docs, products, site-content, ATProto registry, Rizom ecosystem, external plugins, and custom site/theme packages can be selected outside presets                                               |

Two non-union behaviors require explicit treatment rather than a mechanical preset rename:

- Rover `core` uses `dashboard-root`, while its site posture removes that ID and enables
  `dashboard` with different route config.
- Topics configuration differs by posture and contains arrays whose semantics cannot be
  recovered with a generic last-write-wins deep merge.

### Operational coupling

The model/preset contract is also embedded in:

| Area                | Migration inventory                                                                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model packages      | `brains/rover`, `brains/relay`, and `brains/ranger` definitions, package env schemas, seed/eval content, test apps, and model tests                                                                |
| App resolver        | `brain-definition.ts`, `brain-resolver.ts`, `instance-overrides.ts`, `runner.ts`, `generate-entrypoint.ts`, public contracts/exports, and preset-focused tests                                     |
| Published CLI       | build entrypoint, static model registry, bundled env-schema generator/output, init command, brain-YAML loader, public definition exports, docs, packed startup tests, and external-plugin fixtures |
| Evaluation          | CLI `--preset`, suite config/inheritance, run orchestration, coverage tags, and Rover/Relay eval YAML                                                                                              |
| Operations          | `@rizom/ops` schema, registry loader, default-user renderer, verifier, user table, templates/tests, and private pilot `model`/`preset` desired state                                               |
| Sites and instances | Rover/Relay test apps, consolidated Rizom additions, docs-site additions, local site/theme/content conventions, and standalone `brain.yaml` files                                                  |
| Documentation       | model/preset examples and reference-model language across README, app/CLI docs, brain-model docs, architecture, roadmap, and operator playbooks                                                    |

The baseline fixture is generated through
`packages/brain-cli/scripts/brain-model-baseline.ts`; long CSS/content values retain
length plus SHA-256 identity, and absolute worktree paths normalize to `<repo>/...`.
Removing model packages before these callers migrate would break working deployments.

## Settled decisions

1. **One canonical brain.** Rover, Relay, and Ranger are migration inputs, not surviving
   product archetypes.
2. **The canonical catalog lives in the final public package.** Capability/interface
   factories and built-in bundle definitions move behind `@rizom/brain`; no temporary
   fourth model package becomes the new singleton.
3. **Catalog and selection are separate.** The canonical catalog owns factories and base
   config. Bundles select catalog IDs and contribute bounded config, instruction, eval,
   and permission defaults. A selected capability is instantiated once even if multiple
   bundles reference it.
4. **Bundles are fixed and named.** Runtime bundles are `core`, `site`, `publishing`, and
   `team`. They are not parameterized. Instance tuning remains `add`, `remove`, and
   `plugins` config.
5. **Recipes are scaffolding only.** `brain init --recipe minimal|personal|team|commerce`
   expands to explicit `bundles:` plus site/theme/seed defaults. No `recipe:` field is
   stored or interpreted at runtime.
6. **No community bundle.** Commerce is `core + site` with `products` added explicitly.
7. **Site and publishing remain independent.** A publisher may target external channels
   without a site; a site may exist without the publishing stack.
8. **Identity is instance-owned.** Name, anchor profile, brain character, seed content,
   site package, and theme are instance/recipe inputs, not hidden bundle identity.
9. **Posture instructions compose.** Core instructions stay neutral; publishing and team
   contribute non-contradictory instruction fragments in canonical bundle order.
10. **Removal closes all attached defaults.** A removed member does not receive bundle
    config, eval, route-permission, or entity-action contributions attached to that
    member.
11. **YAML order has no policy meaning.** Bundle definition order controls deterministic
    composition. User list order cannot change config or permissions.
12. **The crossover is clean.** Existing models, presets, and the current ops format
    remain unchanged while the canonical definition and replacement desired state are
    tested offline. The replacement is a one-time clean crossover, not a numbered
    successor or the start of a schema-version ladder. Phase 7 exposes one unversioned
    `pilotSchema` with no active
    version discriminator; the old format may remain only as a private offline staging
    input. No runtime loader, registry, renderer, or reconciler accepts both formats.
    Repository runtime selection, checked-in configs, published artifacts, and
    private-pilot desired state cross over in one operator-approved window. A rolling
    fleet may briefly contain old instances running old config and new instances running
    new config, but no process receives a mismatched config/image pair. Rollback restores
    the prior config revision and prior image together; it is not implemented as forward
    dual-format compatibility. There is no model-ID alias layer or mixed
    legacy/canonical resolution path, and a clear migration error replaces silent
    fallback after the switch.
13. **Hosted package versions are explicit at crossover.** There are only three existing
    real hosted sites, so enumerate them and pin every external site and theme package to
    an exact reviewed version in the staged desired state. The active schema does not
    default a site version from the brain version, infer a theme version from a site
    version, or retain a `resolveSiteOverride` compatibility normalizer. Missing pins
    fail schema validation before registry loading. Offline staging materializes the
    reviewed package refs without changing the source repository; it does not guess them.
    Bundled `@brains/*` themes remain part of `@rizom/brain` and are not separately
    installed or version-pinned.
14. **Unification gates stable `v0.2.0`.** Collective validation, complete multi-user
    identity, and optional product features do not gate stable, but the obsolete
    model/preset authoring contract must not be the contract certified by the RC.

## Target bundle taxonomy

The inventory is finalized in Phase 0 after active branches that touch model composition
are either merged or explicitly assigned a port. The intended taxonomy is:

### `core`

Posture-independent runtime foundation:

- infrastructure: prompt, directory-sync, auth-service, the Admin console, notifications,
  email delivery, CMS, one canonical dashboard capability, playbook runtime, onboarding;
- universal entities/workflows: profile, note, link, image, document, wishlist, topics,
  decks;
- discovery/trust: agents, assessment, ATProto registry;
- interfaces: MCP, webserver, web chat, Discord, and A2A;
- the admin-only platform permission baseline now on `main`; alpha.204's anchor-only
  baseline remains migration evidence.

Model-specific capability IDs are normalized during migration:

- the current model-neutral `profile` ID remains `profile`;
- `rover-onboarding` is replaced by `onboarding`;
- `dashboard-root` / `dashboard` become one `dashboard` member with an explicit site
  config override.

There is no runtime capability-alias map. Existing model definitions keep their current
IDs until the crossover; the migration command rewrites old `add`, `remove`, and `plugins`
references before the canonical definition becomes the default.

### `site`

Public web presence:

- site-info, site-content, site-builder, and analytics;
- the explicit dashboard route override needed when the site owns `/`;
- no hard-coded site package, theme, or identity.

`site.package`, local `src/site.ts`, local `src/theme.css`, local
`src/site-content.ts`, and per-instance site/theme overrides remain resolver inputs.

### `publishing`

Content production and distribution:

- blog/post, series, portfolio, content-pipeline, social-media, newsletter, stock-photo;
- outbound ATProto publishing;
- publishing-specific agent instruction fragments and plugin defaults.

### `team`

Shared-memory posture:

- conversation-memory with `memoryVisibility: shared`;
- docs;
- team-specific topic coverage and agent instruction fragments;
- trusted create/update posture for note, link, image, doc, deck, decision, and
  action-item, while destructive actions remain admin-only.

### Explicit opt-ins

These stay outside default bundles unless the Phase 0 inventory records a new product
decision:

- products;
- Obsidian vault;
- Rizom ecosystem;
- low-level chat adapter surfaces not selected by the built-in interfaces;
- opportunity-prioritization;
- LinkedIn import and the managed OAuth broker;
- custom/external plugin packages.

### Recipe output

| Recipe     | Generated runtime selection                                                           |
| ---------- | ------------------------------------------------------------------------------------- |
| `minimal`  | `bundles: [core]`                                                                     |
| `personal` | `bundles: [core, site, publishing]` plus the default personal site/theme/seed content |
| `team`     | `bundles: [core, site, team]` plus team site/theme/seed content                       |
| `commerce` | `bundles: [core, site]`, `add: [products]`, plus commerce site/theme/seed content     |

Recipes may generate explicit additions needed to preserve an old preset, but those
additions must be visible in `brain.yaml`; recipes cannot create hidden runtime variants.

### Intentional differences from alpha.204

| Alpha.204 behavior                                                                                               | Unified target                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin is absent and `anchor` doubles as the administrative permission level                                      | Admin is a core capability; the distinct `admin` level now on `main` owns administrative routes and destructive defaults, while Anchor remains an independent identity facet                                                                                                                                  |
| Decks are absent from Rover/Relay core                                                                           | Decks move to `core` as universal knowledge-work output                                                                                                                                                                                                                                                       |
| Outbound ATProto is in Rover core; the registry is only a catalog/instance addition                              | ATProto registry moves to `core`; outbound ATProto moves to `publishing`                                                                                                                                                                                                                                      |
| `dashboard-root` and `dashboard` are separate capability IDs selected by preset subtraction                      | One `dashboard` member defaults to `/`; `site` explicitly overrides it to `/dashboard`                                                                                                                                                                                                                        |
| `rover-profile` and `rover-onboarding` expose model names in capability IDs                                      | Transitional aliases map to model-neutral `profile` and `onboarding` IDs                                                                                                                                                                                                                                      |
| Rover default mixes blog, decks, analytics, Obsidian, and site infrastructure                                    | Blog belongs to `publishing`, decks to `core`, analytics/site infrastructure to `site`, and Obsidian remains opt-in                                                                                                                                                                                           |
| Rover's definition applies personal-publishing instructions to every preset, including core                      | Canonical `core` is posture-neutral; those instructions move to `publishing`, while `team` later contributes its own non-contradictory posture                                                                                                                                                                |
| Model packages select package-owned seed directories from hidden preset config                                   | Canonical directory sync uses instance-relative `./seed-content`; recipes and migrated instances own the actual seed content                                                                                                                                                                                  |
| Rover's definition supplies a personal site and theme even when core does not select site-builder                | The canonical definition has no site or theme; personal/team/commerce recipes and instance YAML own those choices explicitly                                                                                                                                                                                  |
| Rover does not select `site-content` by preset; production Rizom adds it manually                                | `site-content` belongs to `site` because entity-backed site sections require it                                                                                                                                                                                                                               |
| Relay model defaults carry team instructions, permissions, topic config, site/theme, and seed paths together     | `team` owns instruction/config/permission posture; recipe/instance output owns site, theme, and seed content explicitly                                                                                                                                                                                       |
| Ranger's default preset combines commerce, social distribution, capture, site identity, and seed content         | Commerce is `core + site + add: [products]`; social distribution remains an explicit opt-in, while site/theme/seed and Discord URL-capture choices move to instance output                                                                                                                                    |
| Professional-profile work temporarily adds LinkedIn import to Rover core                                         | Provider-neutral profile ownership remains core; LinkedIn import and OAuth broker remain opt-in                                                                                                                                                                                                               |
| Topics extraction ran with generic thresholds and no source weighting                                            | Calibrated derivation economics (per-source weights, create/reinforce relevance thresholds, semantic merge distance, reconciliation caps, mint ceilings) landed on the alpha line 2026-07-21; the baseline fixture was refreshed to include these additive defaults, with all critical topics flags unchanged |
| Three `ai.rizom.brain.*` lexicons (`card`, `link`, `post`) declared nested objects inline in record properties   | Spec-valid documents: nested objects hoisted into named defs referenced via `type: "ref"` (2026-07-21, gated by the official-parser conformance test). Wire shape of records is unchanged; only the served lexicon config hashes in the fixture moved                                                         |
| Profile starter config duplicates structural `anchorKind`; brain cards publish only that closed structural value | Optional semantic kind moves to composition, category is derived once, starter config drops `anchorKind`, and brain cards publish open `kind` plus closed `category`. The baseline records the profile-config removal and new card-lexicon hash.                                                              |

Every other change must either preserve the fixture or add another explicit row before its
implementation merges.

## Bundle and resolver contract

The implementation should preserve the existing Promise/plugin boundaries. This is a
schema and resolution change, not an Effect conversion.

### Definition shape

The exact exported names are settled by tests, but the contract has these concepts:

```ts
interface CapabilityBundleDefinition {
  id: string;
  members: string[];
  config?: BundleConfigContribution[];
  permissions?: BundlePermissionContribution[];
  agentInstructions?: string[];
  evalDisable?: string[];
}

interface BundleConfigContribution {
  member: string;
  value: Record<string, unknown>;
  overrides?: string; // bundle id explicitly being overridden
}

interface BundlePermissionContribution {
  member: string;
  config: PermissionConfig;
  overrides?: string; // earlier bundle id explicitly being overridden
}
```

`defineBundle()` validates a bundle without instantiating plugins. `defineBrain()` accepts
one capability/interface catalog, ordered bundle definitions, and optional transitional
presets. `CapabilityContext` gains `bundles: readonly string[]`; `preset` remains optional
only during the compatibility phase.

### Selection

1. Resolve selected bundle IDs and reject unknown or duplicate IDs.
2. Union bundle members.
3. Apply eval exclusions.
4. Apply instance `add`.
5. Apply instance `remove` last.
6. Instantiate every surviving catalog member at most once.
7. Instantiate external plugin declarations through their current path unless explicitly
   removed.

`preset` and `bundles` are mutually exclusive. Before the crossover, existing model
presets and bundle-aware definitions share the same resolver kernel but keep separate
catalogs. They are compared structurally rather than translated through a runtime alias
layer. At the crossover, migrated configs select only the canonical definition.

### Config composition

Config order is:

1. catalog base config or config callback;
2. active bundle contributions in definition order;
3. `brain.yaml` plugin override.

A bundle may contribute config only to one of its active members. Different bundles that
write different values to the same config path are rejected at definition validation
unless the later contribution explicitly names the bundle it overrides. Arrays are never
implicitly unioned. A capability needing domain-specific composition, such as topics,
owns a typed config merger or computes its base config from `CapabilityContext.bundles`.

This makes the dashboard site-route replacement explicit and prevents accidental config
changes when users reorder YAML.

### Permission composition

Permission order is:

1. platform entity-action defaults;
2. active plugin-declared entity-action policies;
3. transitional definition defaults, while legacy models exist;
4. `core` bundle contributions;
5. non-core bundle contributions in canonical definition order;
6. instance `brain.yaml` permission overrides.

Every bundle permission contribution is attached to a member ID. If that member is not
active after `remove`, its contribution is absent. A non-core bundle may explicitly
loosen a `core` action, which is how `team` grants trusted writes. Two non-core bundles
that disagree on the same rule/entity/action are a definition error unless one declares
an explicit override; do not silently use YAML order. Identical contributions may
coexist.

The contract covers transport rules and every entity action currently supported:
`create`, `update`, `delete`, `extract`, and `publish`. Phase 1A may define the
member-scoped contribution shape but does not merge policy values. Phase 1B starts from
the `admin` / `trusted` / `public` permission model now on `main`, plus the independent
Anchor identity facet, rather than introducing a second transitional bundle permission
vocabulary.

### Instructions, site, and seed content

- Bundle instruction fragments concatenate in canonical order after neutral base
  instructions. Composition tests reject known Rover-vs-Relay contradictory framing.
- Site packages/themes remain instance choices generated by recipes. The `site` bundle
  selects runtime capabilities but does not force one visual identity.
- Directory-sync seed paths become instance-relative (`./seed-content`) or explicit eval
  overrides. Preset-scoped package seed directories are copied by recipes/migration;
  they are not selected by hidden bundle logic.
- Existing local site/theme/site-content conventions and package-reference resolution are
  unchanged.

## Active-branch coordination

Phase 0 assigns every overlapping worktree an explicit disposition:

| Branch                             | Disposition                                                                                                                                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature/auth-runtime-db`          | Integrated on `main` before Phase 1B. Resolver integration uses its Admin capability and `admin` / `trusted` / `public` permission model; Anchor is an independent identity facet, not a fourth permission level.                                     |
| `work/professional-profile-v2`     | The model-neutral profile/kind architecture now on `main` supplies the canonical `profile` capability. Rebase/port the richer professional fields independently; LinkedIn import and the OAuth broker remain explicit opt-ins and never enter `core`. |
| `feat/opportunity-priority-engine` | Merge independently as an explicit opt-in. It must not enter a built-in bundle during unification.                                                                                                                                                    |

Do not edit generated/scaffolded pilot files to work around branch conflicts. Pilot changes
start upstream in `@rizom/ops` during Phase 6 and are regenerated after release.

## Phasing

Each remaining phase is independently reviewable and keeps the previous input format
working until the migration phase. The characterization fixture remains versioned
migration evidence; every intentional delta is documented and inspected rather than
silently regenerating the baseline.

### Phase 1A — Build the pure bundle kernel (complete)

Implemented in `shell/app/src/bundle-definition.ts` and
`shell/app/src/bundle-resolution.ts`, with direct characterization in
`shell/app/test/bundle-resolution.test.ts`.

This slice deliberately avoids `brain-resolver.ts`, `instance-overrides.ts`, model
packages, permission schemas, and every file then changed by the auth branch. Put the
new contracts and pure resolution logic in isolated `shell/app` modules with direct unit
tests; do not expose or call the kernel from production resolution yet.

- Add the TypeScript/Zod bundle definition and `defineBundle` validation contract.
- Validate unique bundle IDs, unique members, known catalog members, contribution
  ownership, and explicit override references.
- Resolve selected bundle IDs in canonical definition order, independent of YAML order.
- Union members, apply eval exclusions, then `add`, then `remove` last.
- Compose member-scoped config contributions with explicit cross-bundle overrides;
  reject undeclared conflicts and generic array merging.
- Compose instruction fragments and eval contributions deterministically.
- Keep every call immutable so repeated/concurrent resolution cannot leak selected IDs,
  config, or instructions.
- Define the member-scoped permission contribution shape, but treat its config as opaque;
  do not validate levels, compare policy strength, or merge permission values in this
  slice.

Tests first: unknown/duplicate bundles and members, canonical ordering, YAML-order
independence, contribution ownership, config conflicts and explicit overrides, array
rejection, eval/add/remove precedence, instruction composition, permission contribution
filtering by active member, and repeated-resolution isolation.

Exit gate: the pure kernel has no import from auth-service and no production caller;
Phase 1A does not modify the checked-in characterization fixture or preset runtime path.

### Phase 1B — Integrate bundles behind presets (complete)

Implemented on `feature/brain-model-unification-phase-1b` in the brain definition,
instance parser, shared resolver, bundle-permission composer, public authoring contracts,
and focused integration tests. Existing built-in definitions still select presets until
Phase 2 introduces the canonical catalog and `core` bundle.

Prerequisite satisfied: `feature/auth-runtime-db` is integrated on `main`. Preserve the
checked-in characterization fixture as migration evidence and assert every expected
Admin/permission delta explicitly.

- Parse `bundles:` and reject `bundles` + `preset` together.
- Extend `BrainDefinition` and `CapabilityContext` with active bundles while preserving
  transitional `preset`.
- Connect the Phase 1A kernel to `brain-resolver` without adding a second resolution path.
- Validate and merge member-scoped permission contributions using the final
  `admin` / `trusted` / `public` permission contract, independent Anchor identity facet,
  and documented precedence.
- Preserve external plugins, package refs, local site conventions, fresh plugin
  construction, and existing no-bundle behavior.
- Keep legacy model+preset inputs translating into the same kernel used by explicit
  bundles.

Tests first: parser mutual exclusion, permission precedence/conflicts, member removal,
external plugins, local site/theme/content conventions, config callback context, legacy
preset parity, and fresh repeated resolve behavior.

Exit gate: explicit bundles and transitional presets use one resolver; all Phase 0
baseline differences are either preserved or asserted as intentional auth deltas.

### Phase 2 — Establish the canonical catalog and migrate `core` (complete)

Implemented in `packages/brain-cli/src/model/canonical-brain.ts`, with the separate
canonical env declarations beside it and direct characterization in
`packages/brain-cli/test/canonical-brain.test.ts`. The source remains deliberately
unregistered until the coordinated crossover.

- Put the canonical catalog and bundle definitions in their final `@rizom/brain` source
  location and typecheck that source with the packaged workspace.
- Use only final model-neutral member IDs; do not expose transitional aliases.
- Express the current minimal personal posture through `core` without hidden site, theme,
  seed identity, or publishing instructions.
- Keep every existing model definition and packaged registry selection unchanged while the
  canonical definition is characterized in parallel.
- Consolidate the first canonical env schema without deleting model schemas yet.

Exit gate: legacy Rover core and direct canonical `bundles: [core]` resolution match
except for Phase 0's approved deltas, the immutable baseline still passes, and packaged
legacy startup remains unchanged.

### Phase 3 — Add `site` and `publishing`; migrate personal posture (complete)

Implemented in the package-owned canonical definition, with the parallel
`packages/brain-cli/test/fixtures/canonical-personal/brain.yaml` posture and direct
characterization in `packages/brain-cli/test/canonical-personal.test.ts`. Tests were
written and observed failing before the
bundle definitions were added. The fixture remains deliberately unregistered.

- Add site/publishing membership, dashboard route override, topics composition, and
  publishing instructions/config.
- Define the personal recipe's future output through the parallel explicit-bundle fixture;
  activate recipe scaffolding only in Phase 7.
- Characterize Rover default/full against explicit bundle selections plus visible
  additions where exact parity requires them.
- Add parallel canonical posture fixtures while leaving existing Rover app/eval inputs
  untouched until the single crossover.
- Verify custom site package, local site/theme/content, docs capability, and consolidated
  Rizom additions.

Exit gate: direct canonical personal composition preserves unchanged Rover default/full
plugin config and permissions, records visible additions/removals, keeps the immutable
baseline green, and leaves packaged legacy startup unchanged. Boot/eval inputs remain on
the old definitions until the coordinated crossover.

### Phase 4 — Add `team`; migrate Relay (complete)

Implemented in the package-owned canonical definition, with the parallel
`packages/brain-cli/test/fixtures/canonical-team/` instance posture and direct
characterization in `packages/brain-cli/test/canonical-team.test.ts`. Tests were written
and observed failing before `team` was exported. The canonical definition remains
unregistered and Relay's production definition is unchanged.

- Add conversation-memory/docs config, team topic composition, team instructions, and
  member-scoped trusted policies including image and explicit Admin-only
  `publish`/`extract` defaults.
- Keep the seed path, site package/theme choice, and site-content definitions visible in
  the team instance fixture; the bundle conceals none of them.
- Resolve migrated Relay core/default/docs/full test-app inputs from the canonical
  definition and structurally validate the permission, attribution, and approval-hijack
  fixtures. Model-backed eval execution remains deferred until explicitly authorized.
- Characterize Relay's preserved topic, shared-memory, Discord, transport, and effective
  entity-action posture plus the approved universal-core additions.

Exit gate: personal and team postures resolve side by side from one definition without
instruction, permission, site, or seed-content leakage; the immutable legacy baseline
and packaged model selection remain unchanged.

### Phase 5 — Migrate Ranger and explicit opt-ins (complete)

Implemented as characterization in
`packages/brain-cli/test/canonical-commerce.test.ts` with the parallel
`packages/brain-cli/test/fixtures/canonical-commerce/brain.yaml` posture. The canonical
catalog already contained every required factory, so this phase required no production
definition change. Ranger's production definition remains untouched.

- Express commerce as `core + site + add: [products]`.
- Keep Ranger's site package, theme, seed path, and Discord URL-capture config visible in
  the instance fixture. A repository scan found no additional live Ranger instance YAML
  to migrate in this preparation phase.
- Characterize unchanged Ranger plugin config and transport policy, plus the intentional
  universal-core additions and removal of implicit social distribution.
- Verify products, ATProto registry, social, wishlist, Rizom ecosystem, Obsidian, docs,
  and external package additions remain independently selectable and removable.

Exit gate: every Ranger runtime factory exists in the canonical catalog, all named
opt-ins compose independently, and no capability exists only because the Ranger package
owns its factory or config. The immutable baseline and legacy registration remain
unchanged.

### Phase 6 — Prepare authoring and hosted migration (complete)

Implemented in the brain CLI migration/recipe modules, canonical model entrypoint,
explicitly gated app package resolver, dormant registry metadata, packed-consumer fixture,
and offline canonical ops preview. The private pilot and active legacy loaders remain untouched.

- Implement and test recipe expansion to explicit `bundles` without activating it in the
  existing `brain init` path.
- Add `brain config:migrate` to preview model/preset YAML rewrites deterministically,
  preserving comments where the YAML tooling permits. Do not switch runtime selection or
  write repository/fleet configs in this preparation phase.
- Prepare the generated-entrypoint, runner, registry, env-schema, CLI help/docs, packed
  fixture, and public-declaration changes without activating the canonical path.
- Add dormant `@rizom/ops` canonical migration/render tests without releasing them or
  regenerating Rover Pilot. The active registry loader remains strictly on the current
  model/preset format in this phase and no loader accepts both formats. The preview moves
  `model`/`preset` to explicit bundles without renaming content repositories or mutating
  secrets. Do not establish a schema-version ladder: Phase 7 removes preparation-only
  version names and discriminators, exposes one unversioned `pilotSchema`, and keeps any
  old-format reader private to offline staging.
- Preserve existing image/tag identity through the compatibility alpha unless a tag
  migration is explicitly required; runtime composition and operator branding are
  separate concerns.
- Do not edit or reconcile the private pilot repository in this preparation phase.

Exit gate: every in-repository input and representative ops desired-state fixture has a
reviewed deterministic preview, generated output is stable on a second dry run, and all
active runtime/ops paths still use only the legacy contract. The private pilot is not
edited in Phase 6.

### Phase 7 — Stage the single crossover and remove compatibility (complete)

The repository half is merged. The private-pilot staging half stays staged: do not
publish, reconcile, or deploy it without explicit operator authorization — that is
Phase 8.

Repository crossover change:

- switch packaged and monorepo runtime selection to the canonical definition, activate
  recipe-based init, and migrate all checked-in standalone/test/eval/ops inputs to
  explicit bundles;
- update generated entrypoints, runner fallback, the single bundled definition owner,
  CLI help/docs, packed fixtures, and public declarations;
- replace the current model/preset desired-state format with the sole exported and active,
  unversioned `pilotSchema`; remove schema-version discriminators and the old format from
  registry loading, rendering, reconciliation, and verification rather than adding a
  union or version-dispatch path;
- retain a legacy parser only inside the offline migration command if rollback tooling
  requires it; it must not be exported as a second active contract;
- remove `PresetName`, preset parsing/resolution, `{ preset }` config context, eval
  `--preset`, and preset documentation;
- remove the static three-model registry and triplicated bundled model env schemas;
- delete `@brains/relay`, `@brains/ranger`, then `@brains/rover` after their fixtures and
  seed/site assets have final owners;
- make the canonical definition the packaged and monorepo default when `brain:` is absent;
- retain explicit external brain package loading only if the Phase 0 public-API review
  confirms it as a supported advanced authoring surface;
- reject legacy `brain: rover|relay|ranger` with migration guidance and reject the removed
  `preset:` field through strict instance validation;
- require exact `siteOverride.version` values and exact versions for external theme
  packages in the active ops schema. Remove loader-side site/theme version inference and
  `resolveSiteOverride`; bundled themes remain unpinned because they ship with the brain.

Crossover staging and rollback preparation:

- generate the private-pilot desired-state diff with
  `brains-ops crossover:stage <source-repo> <output-dir> <site-pins.yaml>` in a separate,
  secret-free review copy; do not hand-edit generated user files or mutate the source
  repository;
- verify repository names, content repositories, server/domain identity, secret selectors,
  image names, and tag identity are unchanged unless an explicit reviewed migration says
  otherwise;
- pin the exact unified runtime and ops artifact versions used by the staged desired state;
- enumerate the three existing real hosted sites and materialize their exact site and
  external-theme package versions from reviewed package, lockfile, and image evidence.
  Staging fails rather than inferring a missing version;
- prepare a rollback pair consisting of the prior private-pilot revision and prior image
  tag/digest; never roll back only one side;
- run package, packed-consumer, architecture, dependency, env-schema,
  migration-idempotence, and `reconcile-all <review-copy> --dry-run` checks against the
  complete staged diff; require zero first-pass drift and zero second-pass drift without
  writing the review copy or contacting content repositories.

Exit gate: the repository crossover branch, isolated private-pilot review copy and diff,
immutable artifacts, deployment order, health checks, and paired rollback are reviewed and
ready.
Repository-wide architecture checks find no active model/preset dependency, schema-version
dispatch, or hosted package-version inference; only the private offline migration reader
and changelog/history text may retain the old contract. No compatibility branch is merged
merely to make staging easier.

#### Legacy-tagged code retirement strategy

Treat code explicitly named, commented, or tagged `legacy` as an owned migration
inventory, not an informal cleanup list.

1. Maintain the checked-in [legacy-code inventory](../legacy-code-inventory.json) for
   every active-source `legacy` compatibility, migration,
   or durable-data code path. Each entry records its file and symbol, owning subsystem,
   whether it reads, writes, rejects, or migrates old state, current consumers, removal
   prerequisite, rollback dependency, and target release. Historical terminology and
   third-party naming are covered by a static exemption list, not per-occurrence
   entries. A repository check fails when a `legacy` occurrence appears that is neither
   manifested nor exempted.
2. Classify every entry:
   - **brain crossover compatibility** — the removed Docker runner fallback, old theme
     alias, and `brain.config.ts` flow;
   - **offline migration** — brain config migration, private-pilot schema migration, and
     crossover staging;
   - **rejection-only compatibility** — actionable errors for removed config;
   - **durable-data compatibility** — auth databases/cookies, message metadata, workflow
     snapshots, and stored entity schemas;
   - **historical terminology** — tests, comments, plans, and changelogs;
   - **third-party naming** — upstream paths such as `pdfjs-dist/legacy`, which require an
     explicit exemption rather than local renaming.
3. Before Phase 8, remove active brain crossover compatibility after proving canonical
   consumers no longer require it: the `.model-entrypoint.js` fallback, old theme package
   alias, `brain.config.ts` build fallback, and any other mixed canonical/legacy
   resolution. All checked-in consumers use canonical `brain.yaml`. Legacy model and
   preset knowledge remains only in offline migration modules and migration/rejection
   tests. Dependency tests prove runtime boot and active ops loading cannot import those
   offline modules.
4. During Phase 8, old instances remain on their immutable old config/image pair until
   their turn, while migrated instances use the canonical pair. Rollback restores the
   prior Git revision and old image; the new runtime does not carry a compatibility path
   for rollback. Record that no deployed config contains model, preset, or an old-format
   schema discriminator, and that every external hosted package has an exact pin.
5. The rollback horizon closes when the Phase 8 second reconcile converges with zero
   drift and the hosted canaries plus `yeehaa.io` have soaked for 48 continuous hours on the unified
   alpha; then delete the private-pilot migration and crossover staging modules,
   command, exports, tests, and documentation. Public `brain config migrate` remains
   supported until stable `0.2.0` ships and is deleted with that release, along with
   the corresponding legacy-name inventories and rejection messages.
6. Retire unrelated durable-data compatibility independently through
   **expand → backfill → stop old writes → observe zero old reads → contract**. It must
   have its own owner and gate and must not be coupled mechanically to the brain
   crossover.

Legacy retirement exit gate: no active brain-crossover runtime or ops path is
legacy-tagged; only explicitly time-bounded brain-crossover offline migration entries
remain; every unrelated retained entry has an owner, exemption or deletion gate, and
target release; and pre-commit/CI prevents untracked legacy compatibility from returning.

### Phase 8 — Execute the clean crossover and certify the unified alpha

First remove the canary-discovered ops blocker through a normal reviewed release:

1. Keep `views/users.md` under the explicit users-table rendering path;
   reconciliation must not overwrite observational status.
2. Have `reconcile-all --dry-run` print both changed-file lists so operator evidence never
   depends on private diagnostic scripts.
3. Test post-render reconciliation, two-pass convergence, blocked external access, and
   input preservation.
4. Publish the corrected `@rizom/ops` alpha, then regenerate staging from a freshly fetched
   pilot tip. Evidence from any earlier source revision certifies nothing.

Then execute only in an explicitly authorized maintenance window:

1. Freeze pilot reconciliation, deploy automation, and unrelated releases.
2. Verify the unified runtime and matching `@rizom/ops` artifact through package,
   declaration, packed-startup, and registry-integrity checks.
3. Apply the reviewed private-pilot desired-state revision on an isolated canary branch
   with exact artifact pins. The new ops loader reads only the canonical schema.
4. Build and record immutable image digests before deployment.
5. Deploy each approved instance as one coherent config/image unit. Existing instances
   remain on the old config and old image until their turn; never pair either side with
   the other contract.
6. Verify `/health/operate` version/status, expected unauthenticated MCP `401`, identity,
   repository/secret selectors, and application-managed site output after each deploy.
   Site evidence must come from a fresh rebuild on the running app rather than a
   persisted pre-deploy `dist`; local `src/site.ts` overrides must retain the selected
   base site's plugin, templates, and datasources. Render observed fleet status
   separately after these probes.
7. Run a second reconcile and require zero drift in reconciler-owned generated config
   before lifting the freeze. `views/users.md` is not a reconciler-owned output.
8. If any gate fails, restore the prior desired-state revision and prior image together,
   then verify convergence with the prior ops release.

After crossover convergence:

- run model-backed canonical `core`, `personal`, `publishing`, `team`, and `commerce`
  eval suites only with explicit operator authorization;
  deterministic composition and permission tests remain mandatory regardless;
- soak `jo` and `smoke`, validate the personal posture on `yeehaa.io`, then continue the
  wider pilot rollout under the same coherent-pair rule;
- confirm no active deployment or desired-state file uses model/preset or an old-format
  schema discriminator, and no external hosted package version is implicit;
- nominate the deployed unified alpha as the stable `0.2.0` release candidate only after
  the fleet and repository are wholly on the canonical contract.

## Validation gates

Every implementation phase runs the lightest relevant checks first, then the broader
checks when shared contracts move:

- targeted `shell/app`, `packages/brain-cli`, affected model/posture, and `@rizom/ops`
  tests;
- typecheck and root-wrapper lint for affected workspaces;
- formatting and docs checks when docs or manifests change;
- public API/declaration and Effect-import-boundary checks when package surfaces move;
- architecture/dependency/workspace/env-schema checks when package ownership changes;
- packaged consumer and external-plugin startup smokes before deleting compatibility;
- generated pilot convergence, config/image pairing checks, paired rollback rehearsal,
  and live app-managed site rebuilds for deployed postures.

Composition parity is tested structurally. Model evals validate behavior at explicit
checkpoints; they are not a substitute for deterministic resolver tests and are not run
without operator authorization.

## Completion criteria

The plan is complete when:

- one canonical definition and four bundles remain;
- no runtime preset or built-in model registry remains;
- no archetype package is required to build, boot, evaluate, initialize, or deploy a
  brain;
- personal, team, commerce, docs, consolidated Rizom, and external-plugin fixtures resolve
  from explicit bundles/additions;
- pilot and standalone configuration migration is documented and proven idempotent;
- the active ops/runtime surface exposes only the canonical contract, with any legacy
  reader isolated to offline migration tooling;
- unified canaries and `yeehaa.io` are healthy on the nominated alpha;
- the roadmap and authoring/deploy docs describe only the one-brain bundle model;
- stable `0.2.0` is cut from that unified contract.

## Non-goals

- Completing multi-user identity or the auth runtime DB inside bundle resolution.
- Adding opportunity prioritization, LinkedIn import, OAuth broker, web search, or team
  product features to a default bundle merely because their branches exist.
- Renaming Rover Pilot repositories, content repositories, servers, domains, or operator
  branding as part of runtime composition.
- Making bundles runtime-mutable after boot.
- Hiding instance site, theme, identity, or seed choices inside bundle code.
- Replacing Zod schemas, plugin lifecycle ownership, or Promise-based public APIs.

## Risks and controls

- **Accidental permission widening:** member-scoped contributions, conflict validation,
  and full effective-policy snapshots precede migration.
- **Config drift hidden by unions:** arrays never merge generically; posture-sensitive
  capabilities own typed composition.
- **Deleting a model before its assets move:** package deletion is Phase 7, after fixture,
  seed, site, env, and deploy ownership checks.
- **Hosted fleet contract mismatch:** deployments are frozen; the staged desired-state
  revision pins the matching runtime/ops artifacts; each instance moves as one
  config/image unit; second-reconcile convergence is required before unfreezing; rollback
  restores the prior config revision and image together. The new loader never accepts
  both desired-state formats and never infers external package versions.
- **Active branch collision:** each overlapping worktree receives an explicit merge/port
  disposition in Phase 0.
- **Release scope expansion:** only unification and defects found by its gates block the
  RC; unrelated optional capabilities remain opt-in or parked.

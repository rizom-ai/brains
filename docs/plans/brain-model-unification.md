# Plan: Brain Model Unification — One Brain, Capability Bundles

Last updated: 2026-07-21

## Status

Phase 0 complete; Phase 1A's pure bundle kernel is **in progress on
`feature/brain-model-unification-phase-1a`** (bundle definition/resolution committed on
the worktree; unmerged) and remains a **pre-`v0.2.0` release-candidate gate**. Phase 1A
can proceed while `feature/auth-runtime-db` finishes; Phase 1B's parser, resolver, and
permission integration waits for that branch. No bundle runtime is on `main` yet. The alpha.204 model and preset contract is frozen in
`packages/brain-cli/test/fixtures/brain-model-unification-baseline.json`, including
catalog IDs, selected members, sanitized resolved config, instruction text, effective
permissions, site/theme identity, and the consolidated Rizom additions. The fixture was
refreshed on 2026-07-21 to absorb the recorded topics-calibration delta (see the
intentional-differences table); every other value remains the alpha.204 contract.

The known-good baseline is `@rizom/brain@0.2.0-alpha.204`, healthy on the hosted `jo` and
`smoke` canaries and on the consolidated `rizom.ai` production deployment. Unification
happens on the alpha line. A unified alpha must pass the release-candidate gates before
Changesets exits prerelease mode.

This plan supersedes the preset/three-reference-model framing of the retired
`relay-presets.md` and the retired `custom-brain-definitions.md`. Team-native product work
remains in [team-posture-capabilities.md](./team-posture-capabilities.md); real multi-user
identity remains in [auth-runtime-db.md](./auth-runtime-db.md) and
[multi-user.md](./multi-user.md).

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
- hosted pilot desired state and standalone apps migrate before legacy model/preset
  support is deleted;
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
12. **Legacy support is transitional.** `brain:` and `preset:` remain readable for one
    compatibility alpha while repository and fleet configs migrate. They are removed
    before the release candidate, with a clear migration error rather than a silent
    fallback.
13. **Unification gates stable `v0.2.0`.** Collective validation, complete multi-user
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
- the admin-only platform permission baseline from `feature/auth-runtime-db`; alpha.204's
  anchor-only baseline remains frozen only as migration evidence.

Model-specific capability IDs are normalized during migration:

- `rover-profile` → `profile`;
- `rover-onboarding` → `onboarding`;
- `dashboard-root` / `dashboard` → one `dashboard` member with an explicit site config
  override.

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
  action-item, while destructive actions remain admin-only after the auth branch lands.

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

| Alpha.204 behavior                                                                                             | Unified target                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin is absent and `anchor` doubles as the administrative permission level                                    | Admin is a core capability; the auth branch's distinct `admin` level owns administrative routes and destructive defaults                                                                                                                                                                                                                      |
| Decks are absent from Rover/Relay core                                                                         | Decks move to `core` as universal knowledge-work output                                                                                                                                                                                                                                                                                       |
| Outbound ATProto is in Rover core; the registry is only a catalog/instance addition                            | ATProto registry moves to `core`; outbound ATProto moves to `publishing`                                                                                                                                                                                                                                                                      |
| `dashboard-root` and `dashboard` are separate capability IDs selected by preset subtraction                    | One `dashboard` member defaults to `/`; `site` explicitly overrides it to `/dashboard`                                                                                                                                                                                                                                                        |
| `rover-profile` and `rover-onboarding` expose model names in capability IDs                                    | Transitional aliases map to model-neutral `profile` and `onboarding` IDs                                                                                                                                                                                                                                                                      |
| Rover default mixes blog, decks, analytics, Obsidian, and site infrastructure                                  | Blog belongs to `publishing`, decks to `core`, analytics/site infrastructure to `site`, and Obsidian remains opt-in                                                                                                                                                                                                                           |
| Rover does not select `site-content` by preset; production Rizom adds it manually                              | `site-content` belongs to `site` because entity-backed site sections require it                                                                                                                                                                                                                                                               |
| Relay model defaults carry team instructions, permissions, topic config, site/theme, and seed paths together   | `team` owns instruction/config/permission posture; recipe/instance output owns site, theme, and seed content explicitly                                                                                                                                                                                                                       |
| Professional-profile work temporarily adds LinkedIn import to Rover core                                       | Provider-neutral profile ownership remains core; LinkedIn import and OAuth broker remain opt-in                                                                                                                                                                                                                                               |
| Topics extraction ran with generic thresholds and no source weighting                                          | Calibrated derivation economics from `work/topics-derivation` (per-source weights, create/reinforce relevance thresholds, semantic merge distance, reconciliation caps, mint ceilings) — landed on the alpha line 2026-07-21; the baseline fixture was refreshed to include these additive defaults, with all critical topics flags unchanged |
| Three `ai.rizom.brain.*` lexicons (`card`, `link`, `post`) declared nested objects inline in record properties | Spec-valid documents: nested objects hoisted into named defs referenced via `type: "ref"` (2026-07-21, gated by the official-parser conformance test). Wire shape of records is unchanged; only the served lexicon config hashes in the fixture moved                                                                                         |

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

`preset` and `bundles` are mutually exclusive. During compatibility, legacy
model+preset inputs translate to an explicit bundle/add/remove selection before normal
resolution; there is no second resolver.

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
the auth branch's `admin` / `trusted` / `public` permission model plus independent
Anchor identity facet rather than introducing a second transitional bundle permission
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

| Branch                             | Disposition                                                                                                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `feature/auth-runtime-db`          | Merge before Phase 1B, not Phase 1A. The pure kernel avoids its files and does not merge policy values. Resolver integration then uses its Admin capability and four-level permission model rather than the obsolete alpha.204 anchor/admin conflation.                  |
| `work/professional-profile-v2`     | Rebase/port after auth and before Phase 2 catalog freeze. Keep the provider-neutral profile extension/migration in `core`; LinkedIn import and the OAuth broker remain explicit opt-ins even though the current worktree temporarily adds LinkedIn import to Rover core. |
| `work/topics-derivation`           | Keep independent and port before Phase 3 finalizes posture-sensitive topics config. Its reviewed source tiers/weights replace generic array union; Phase 1A only supplies deterministic bundle context and conflict handling.                                            |
| `feat/opportunity-priority-engine` | Merge independently as an explicit opt-in. It must not enter a built-in bundle during unification.                                                                                                                                                                       |

Do not edit generated/scaffolded pilot files to work around branch conflicts. Pilot changes
start upstream in `@rizom/ops` during Phase 6 and are regenerated after release.

## Phasing

Each remaining phase is independently reviewable and keeps the previous input format
working until the migration phase. The Phase 0 characterization fixture remains unchanged
until a canonical bundle profile is compared against it; intentional deltas are asserted
separately rather than silently regenerating the baseline.

### Phase 1A — Build the pure bundle kernel

This slice deliberately avoids `brain-resolver.ts`, `instance-overrides.ts`, model
packages, permission schemas, and every file currently changed by the auth branch. Put the
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
alpha.204's preset path and baseline fixture remain byte-for-byte unchanged.

### Phase 1B — Integrate bundles behind presets

Prerequisite: merge/rebase `feature/auth-runtime-db`. Preserve the immutable alpha.204
fixture as migration evidence and assert its expected Admin/permission delta separately.

- Parse `bundles:` and reject `bundles` + `preset` together.
- Extend `BrainDefinition` and `CapabilityContext` with active bundles while preserving
  transitional `preset`.
- Connect the Phase 1A kernel to `brain-resolver` without adding a second resolution path.
- Validate and merge member-scoped permission contributions using the final four-level
  subject/permission contracts and documented precedence.
- Preserve external plugins, package refs, local site conventions, fresh plugin
  construction, and existing no-bundle behavior.
- Keep legacy model+preset inputs translating into the same kernel used by explicit
  bundles.

Tests first: parser mutual exclusion, permission precedence/conflicts, member removal,
external plugins, local site/theme/content conventions, config callback context, legacy
preset parity, and fresh repeated resolve behavior.

Exit gate: explicit bundles and transitional presets use one resolver; all Phase 0
baseline differences are either preserved or asserted as intentional auth deltas.

### Phase 2 — Establish the canonical catalog and migrate `core`

- Put the canonical catalog and bundle definitions in their final `@rizom/brain` source
  location; the packaged build consumes that source directly.
- Normalize the profile, onboarding, and dashboard capability IDs with transitional alias
  mapping.
- Express the current minimal personal posture through `core`.
- Keep `brain: rover` + `preset: core` translating through the same bundle resolver.
- Consolidate the first canonical env schema without deleting model schemas yet.

Exit gate: legacy Rover core and explicit `bundles: [core]` match except for Phase 0's
approved deltas, and packaged startup still works.

### Phase 3 — Add `site` and `publishing`; migrate personal posture

- Add site/publishing membership, dashboard route override, topics composition, and
  publishing instructions/config.
- Make the personal recipe reproduce the supported personal-publishing posture.
- Map Rover default/full inputs to explicit bundle selections plus visible additions where
  exact legacy parity requires them.
- Migrate Rover test apps and eval suite definitions from preset inheritance to explicit
  bundle combinations while retaining compatibility tests for old YAML.
- Verify custom site package, local site/theme/content, docs capability, and consolidated
  Rizom additions.

Exit gate: all Rover boot/composition tests and deterministic eval harness tests pass from
the canonical definition.

### Phase 4 — Add `team`; migrate Relay

- Add conversation-memory/docs config, team topic composition, team instructions, and
  member-scoped trusted policies including image and `publish`/`extract` defaults.
- Move Relay seed content, site package/theme choice, and content definitions into the
  team recipe/instance fixtures; bundles do not conceal these choices.
- Run Relay test apps and permission/attribution/approval-hijack fixtures against the
  canonical definition.
- Keep `brain: relay` as a compatibility translation until Phase 7.

Exit gate: personal and team postures boot side by side from one definition without
instruction, permission, site, or seed-content leakage.

### Phase 5 — Migrate Ranger and explicit opt-ins

- Express commerce as `core + site + add: [products]`.
- Migrate Ranger site/theme/seed fixtures and any still-live instance config.
- Verify products, ATProto registry, social, wishlist, Rizom ecosystem, Obsidian, docs,
  and external plugin additions remain independently selectable.
- Keep `brain: ranger` as a compatibility translation until Phase 7.

Exit gate: no capability exists only because an archetype package still owns its factory
or config.

### Phase 6 — Migrate authoring and hosted operations

- Change `brain init` to recipes that emit explicit `bundles`; keep `--model` only as a
  deprecated compatibility input for one alpha.
- Add `brain config:migrate` to rewrite model/preset YAML deterministically while
  preserving comments where the YAML tooling permits and always showing a diff before
  `--write`.
- Update generated entrypoints, runner fallback, model registry, env schema generation,
  CLI help/docs, packed fixtures, and public declarations.
- Update `@rizom/ops` source schemas/templates/tests first, release it, then regenerate
  Rover Pilot. Move pilot schema v1 `model`/`preset` to schema v2 explicit bundles without
  renaming content repositories or mutating secrets.
- Preserve existing image/tag identity through the compatibility alpha unless a tag
  migration is explicitly required; runtime composition and operator branding are
  separate concerns.
- Reconcile the private pilot repo through the released ops command, never by hand-editing
  generated workflow/deploy artifacts.

Exit gate: all checked-in standalone/test apps and all hosted desired-state files use
explicit bundles; generated config is stable on a second reconcile.

### Phase 7 — Remove presets and archetype packages

Only after repository and fleet migration:

- remove `PresetName`, preset parsing/resolution, `{ preset }` config context, eval
  `--preset`, and preset documentation;
- remove the static three-model registry and triplicated bundled model env schemas;
- delete `@brains/relay`, `@brains/ranger`, then `@brains/rover` after their fixtures and
  seed/site assets have final owners;
- make the canonical definition the packaged and monorepo default when `brain:` is absent;
- retain explicit external brain package loading only if the Phase 0 public-API review
  confirms it as a supported advanced authoring surface;
- reject legacy `brain: rover|relay|ranger` and `preset:` with a migration command in the
  error message.

Exit gate: repository-wide architecture checks find no runtime model/preset dependency;
only changelog/history text may retain the old names.

### Phase 8 — Unified alpha and stable release candidate

- Add the release changeset and publish one unified alpha.
- Run package build/declaration/public-API/architecture/dependency/workspace/env-schema
  checks and packed external-plugin/startup smokes.
- Run model-backed Rover/Relay eval suites only with explicit operator authorization;
  deterministic composition and permission tests are mandatory regardless.
- Deploy the unified alpha to `jo` and `smoke`; verify `/health` version/status and the
  expected unauthenticated MCP `401`.
- Validate the personal posture on `yeehaa.io`, then roll to the wider pilot only after
  the canary soak.
- Nominate that deployed alpha as the stable `0.2.0` release candidate and complete the
  remaining compatibility sign-off.

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
- generated pilot convergence and live app-managed site rebuilds for deployed postures.

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
- **Hosted fleet split-brain:** ops migrates desired state through a released schema and
  verifies second-reconcile convergence before compatibility removal.
- **Active branch collision:** each overlapping worktree receives an explicit merge/port
  disposition in Phase 0.
- **Release scope expansion:** only unification and defects found by its gates block the
  RC; unrelated optional capabilities remain opt-in or parked.

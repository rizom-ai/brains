# Plan: Identity Profiles, Style Guide, and Site Composition

## Status

Implemented in the repository, including the revised Phase 7 safe deterministic agent aliases, bounded structured character generation, and strict legacy-default backfill. Deployment, live backfill, and republication of the two currently published ATProto cards remain operational follow-up work.

A post-implementation review confirmed the anchor-kind cutover is complete and consistent and the alias/backfill/style-guide work matches intent. All six findings from that review have now been implemented and validated; see [Post-implementation review follow-ups](#post-implementation-review-follow-ups).

**The anchor-kind model is being redesigned** — see [Revision — profile `kind` and derived `category`](#revision--profile-kind-and-derived-category). The shipped single `kind` content enum is replaced by an optional semantic `kind` selected in composition from an open catalog and a structural `category` derived only when a kind is selected. Profiles without a kind use the base fields and have no category. This supersedes decisions 2, 3, 11, and the kind-specific part of 12. Not yet implemented; the branch still carries the shipped approach.

This plan concerns git-synced, markdown-backed identity and generation guidance. Runtime
users, authentication, roles, and authorization remain owned by the runtime identity
plans.

Related plans:

- [brain-model-unification.md](./brain-model-unification.md) — profile and style-guide
  capabilities must work in the canonical brain rather than remain model-specific.
- [identity-and-trust.md](./identity-and-trust.md) — runtime subjects, domain identity,
  trust, and authorization remain separate from public content profiles.

## Revision — profile `kind` and derived `category`

This revision supersedes the shipped anchor-kind approach. It is the new target. The
content-owned kind enum and its auto-transition code are removed only after the staged
fleet migration below. Style-guide and represented-site-identity decisions remain;
site profile views need the integration change described here.

**Sequencing dependency:** this revision assumes the unified-brain bundle runtime from
[brain-model-unification.md](./brain-model-unification.md) — the top-level `kind:`
selection, `bundles:`, and `@rizom/brain` composition it describes do not exist on
`main` yet (that work is in progress on a separate branch; the alpha.204 model/preset
contract is still frozen). Do not start implementation against the current `preset:`-based
runtime; it lands only after the bundle runtime does.

### Problem with the shipped model

The shipped model made `kind` a content field carrying `person | team |
organization`, then modeled `professional` as an extension layered on `person`. That
conflated two questions:

1. Which semantic profile schema and presentation does this instance select?
2. Which stable structural bucket does that selection map to for interoperability?

`professional → person` and `collective → organization` are type-to-category
derivations, not content-value renames. The single-field model had no place to express
both values.

### Optional `kind`, derived `category`

- **`kind`** is the optional semantic profile type: `professional`, `team`,
  `organization`, or a plugin-defined value such as `artist`, `foundation`, `studio`,
  or `collective`. It describes the anchor profile, not the brain character. It is open
  and extensible.
- **`category`** is the closed structural bucket `person | team | organization`.
  Every registered kind maps to exactly one category. Category is derived, never
  configured or authored, and does not exist when no kind is selected.

`kind` selects profile fields, validation, labels, and any specialized presentation.
`category` supports stable grouping, discovery, and protocol interoperability. A
consumer never selects a profile schema from category: `professional` and `artist` may
both map to `person` while exposing different fields.

### Base profile and composition-owned `kind`

The base profile capability is part of the unified brain's `core` bundle. A minimal
instance needs no kind and receives only the default profile fields:

```yaml
brain: "@rizom/brain"
bundles: [core]
```

An instance selects zero or one kind at top level when it needs a specialized profile:

```yaml
brain: "@rizom/brain"
bundles: [core, site, publishing]
kind: professional
```

- `kind` has no `anchor:` wrapper; category is derived and never configured.
- `anchor-profile.md` contains profile data only. It carries neither kind nor category.
- With no selected kind, the base schema validates the profile and the resolved profile
  classification is absent.
- With a selected kind, its field schema extends the base schema.
- Removing or changing kind is a deliberate composition change that requires restart
  and revalidation of existing profile content.
- Enabling typed ATProto brain-card publication requires a selected kind. Minimal
  instances may still use the base profile and discover other cards.

### Public catalog extension point

Kind definitions live in code and are contributed through a published registration API:

```ts
context.profileKinds.register({
  kind: "artist",
  category: "person",
  fields: artistProfileFields,
  labels: { singular: "Artist", plural: "Artists" },
});
```

The profile package registers the generic `professional`, `team`, and `organization`
kinds. Plugins, including external packages, may register richer kinds. The
Rizom-specific profile-kind plugin is the first concrete extension and registers
`collective → organization`; `collective` is not added to the generic base catalog.
External providers remain explicit composition dependencies rather than being inferred
or installed from the selected string:

```yaml
kind: collective
plugins:
  collective-profile:
    package: "@rizom/profile-collective"
```

The package name above is illustrative until implementation fixes the exported package
name. Two contracts are public: the registration API and the closed, base-owned category
enum. An external kind may map only to an existing category.

### App-scoped registration and finalization

The catalog is app-scoped, never a module singleton. Boot follows this order:

1. Parse optional top-level kind as an opaque non-empty string.
2. Instantiate configured built-in and external plugins.
3. Let plugins register kind definitions into the app registry.
4. Run an explicit post-registration, pre-initial-sync finalization barrier.
5. At that barrier, reject duplicate keys, reject a selected kind with no registered
   definition, derive category, install the selected field schema, and freeze the
   resolved result.
6. Only then run initial content discovery and profile validation.

A collision or unknown selected kind aborts the whole boot after scoped registration
resources roll back. It must not merely disable one provider and continue with a
fallback profile. A kind string never implicitly loads its provider package.

After finalization, every consumer reads one immutable selected result or `null`:

```ts
interface ResolvedProfileKind {
  kind: string;
  category: "person" | "team" | "organization";
  labels: { singular: string; plural: string };
}

type ResolvedProfileSelection = ResolvedProfileKind | null;
```

The registry also retains the selected field schema for profile validation. Starter
identity, CMS, sites, A2A, ATProto, discovery, assessment, and dashboards consume the
same resolved classification rather than deriving category independently.

### Profile persistence and site views

The selected kind schema is the authoritative write/persistence validator. With no
selected kind, only the base profile schema applies. Migration never prunes unknown
authored extension fields: they continue to count as authored identity, and incompatible
fields fail clearly rather than being silently dropped.

Sites use consumer-specific read projections instead of importing an authoritative
kind schema. Generic sites parse a loose common profile view and render fields they
understand. A specialized site extends that view with fields it uses; a kind plugin may
export the reusable view schema or contribute specialized rendering. For example, an
artist site can declare typed `mediums` and `galleryUrl` fields while a generic site
preserves and ignores them. This keeps profile validity kind-owned without preventing
custom sites from using extension data.

### Wire contract and two-card migration

The new typed card shape carries both values explicitly:

```ts
anchor: {
  did: string;
  name: string;
  category: "person" | "team" | "organization";
  kind: string;
}
```

`category` is required and uses closed `knownValues`; semantic `kind` is a required,
open string. An ATProto card writer therefore requires a selected profile kind. The A2A
v2 anchor extension emits kind and category together when selected and omits both for a
base profile with no kind. The two currently published ATProto cards are small enough to
migrate rather than preserving the shipped shape indefinitely.

Use a reader-first cutover:

1. Deploy readers that accept both the shipped `anchor.kind` structural shape and the
   new `{ category, kind }` shape.
2. Update the ATProto lexicon, canonical writer, and A2A anchor extension. Use a v2 A2A
   extension URI while readers temporarily accept v1 and v2.
3. Republish both ATProto cards in the new shape.
4. Refresh derived agent-directory records and verify both cards.
5. Remove old-shape compatibility only after every deployed reader is upgraded.

During transition, `normalizeDiscoveredBrainCard` remains peer-facing. For an old card,
it derives category from the old structural kind or known alias and retains the old
value as the best available semantic label until that peer republishes. It no longer
normalizes this brain's own profile content.

### What this supersedes and removes

- Decisions 2 and 3 are replaced by optional semantic kind, derived category, and the
  catalog.
- Decision 11's own-content alias is temporary migration support. Peer-facing discovery
  normalization remains through the wire cutover.
- Anchor kind/category are removed from `anchor-profile.md`; the profile backfill no
  longer fingerprints or writes that field.
- The profile plugin's duplicate `starterIdentity.anchorKind` config is removed. Starter
  generation consumes the frozen resolved kind/category when present and base-profile
  context otherwise.
- The CMS kind dropdown disappears because kind is composition-owned. The generic pipe
  unwrap introduced by commit `e58071ccc` remains.
- The base profile stays in the unified brain's core bundle. Selecting a kind chooses an
  extension; it does not activate the profile capability.
- Rover, Relay, and Ranger are non-surviving model-package migration inputs under
  [brain-model-unification.md](./brain-model-unification.md), not durable profile-kind
  configuration targets.

### Staged instance and content migration

Move the surviving unified-brain instance configurations in this order:

1. Add top-level kind where specialization is required while leaving content kind in
   `anchor-profile.md`. Existing runtimes ignore the new top-level field and continue
   reading content.
2. Deploy the new runtime with config-owned kind. Temporarily accept content kind only to
   verify that its structural category agrees with the configured selection, then remove
   it before applying the selected field schema.
3. Strip kind from each migrated `anchor-profile.md`.
4. Remove own-content compatibility only after the content sweep confirms no surviving
   instance stores kind.

The canonical minimal recipe emits no kind and uses base profile fields. Unified-brain
recipes may scaffold explicit instance choices such as `personal → professional`,
`team → team`, and `commerce → organization`; rizom.ai explicitly selects `collective`
and loads its provider plugin. Do not create enduring Rover/Relay/Ranger config targets.
Keep their fixtures only as brain-model-unification migration evidence until those model
packages are removed.

### Implementation phases

1. **Contracts and boot barrier.** Add optional top-level kind, the app-scoped registry,
   closed category enum, public registration API, base definitions, and deterministic
   pre-sync finalization. Cover no-kind, unknown-kind, and collision behavior first.
2. **Profile persistence and views.** Remove kind from the target base content schema,
   apply the selected extension schema at finalization, preserve authored unknown fields,
   and move sites to consumer-specific loose view schemas.
3. **Consumers and transitional readers.** Point structural consumers at resolved
   category, expressive consumers at resolved kind, and accept both card generations.
4. **Instance/content migration.** Add kind to surviving unified instance configs,
   tolerate and verify old content kind, strip it from content, and remove
   `starterIdentity.anchorKind`.
5. **Wire migration.** Publish the new lexicon/A2A contract, republish both cards,
   rebuild derived directory records, and verify live discovery.
6. **Cleanup.** Remove `authoredAnchorProfileKindSchema` and own-content transition code
   only after Step 4. Remove peer-card compatibility only after Step 5's fleet gate. Keep
   the generic CMS pipe unwrap.

Tests first at each step: zero-kind base profiles; app isolation; registration,
collision, and unknown selected definitions; external-kind category enforcement;
strict selected-schema validation; unknown-field preservation; typed custom site fields;
config/content
category mismatch; structural and expressive consumer separation; old/new card reads;
A2A v1/v2 reads; typed publication rejection without kind; and both live card
republication checks.

## Goal

Create one coherent model for:

- the brain's own identity;
- the person, team, or organization anchoring the brain;
- kind-specific anchor profiles;
- one first-class style guide for textual and visual generation;
- website presentation without making a site mandatory;
- an optional future brand identity without introducing one before it is needed.

Success means prompts describe tasks and output formats, durable identity data and style
choices live in editable markdown entities, and optional profile kind remains an explicit
composition choice in `brain.yaml`.

## Settled decisions

1. **Keep two universal identity subjects.** `brain-character` describes the brain;
   `anchor-profile` describes who or what anchors it.
2. _(Superseded — see [Revision](#revision--profile-kind-and-derived-category).)_
   **Anchor kind is `person | team | organization`.** Do not add `profileType`.
3. _(Superseded — see [Revision](#revision--profile-kind-and-derived-category).)_
   **All anchor profiles extend `anchor-profile`.** Professional, team, and organization
   profiles are schemas registered against the singleton, not separate entity types.
4. _(Partly superseded — see [Revision](#revision--profile-kind-and-derived-category).)_
   **Shell owns only base identity contracts.** Profile fields and validation live in
   `@brains/profile` and profile-kind plugins. The base profile capability belongs to the
   unified brain's core bundle; selecting a kind is optional specialization, not plugin
   activation.
5. **One brain has one style guide.** `style-guide` is a first-class singleton entity,
   not embedded identity frontmatter and not referenced by ID.
6. **Generation is not publishing-specific.** Any content or image workflow may consume
   the style guide; factual extraction and transformations can opt out.
7. **Prompts remain task-specific.** Format, safety, and task instructions stay in prompt
   templates. Durable tone, vocabulary, palette, composition, and art direction move to
   the style guide.
8. **Represented identity and style are separate.** A workflow may represent the brain,
   the anchor, or neither; styled workflows use the same singleton style guide.
9. **Keep `site-info` separate.** It is optional channel configuration and selects
   `represents: brain | anchor`. It does not own generation style.
10. **Do not introduce a mandatory brand entity.** Add one only when a real identity is
    distinct from both brain and anchor.
11. _(Superseded — see [Revision](#revision--profile-kind-and-derived-category); the
    authored-content alias is removed, only peer discovery normalization remains.)_
    **Rename the vocabulary; transition legacy values automatically at every read
    boundary.** The public contracts (lexicon `knownValues`, A2A) move to the new
    vocabulary immediately, but no content is required to migrate ahead of a deploy.
    Two symmetric alias tables (`professional` → `person`, `collective` →
    `organization`) coerce legacy values into this build's canonical set at read
    time: `normalizeDiscoveredBrainCard` in `@brains/atproto-contracts` for cards
    discovered from peers, and `authoredAnchorProfileKindSchema` in
    `@brains/identity-service` for a brain's own authored `anchor-profile.md`
    singleton. A brain upgrading past the rename therefore reads a pre-cutover
    `kind: collective` as `organization` instead of failing closed to fallback
    identity, and re-serializes the canonical value on the next write. The
    standalone `anchorProfileKindSchema` stays a strict enum for AI-output and
    public contract schemas. Both alias tables are retained until every fleet brain
    is on the new vocabulary; their removal is Phase 6 cleanup, after which reads
    fail closed on legacy kinds by design.
12. _(Partly superseded — see [Revision](#revision--profile-kind-and-derived-category);
    anchor kind comes from configuration, so the backfill no longer fingerprints a
    content `kind` field. Brain-character generation and agent aliases stand.)_
    **Backfill defaults without touching authored identity.** Fresh brains and existing
    brains that still match exact known legacy-default fingerprints receive a deterministic
    agent alias plus a one-time, context-generated character. Any authored or partially
    customized identity content is preserved.
13. **Use the canonical brain identity as the alias seed.** Per
    [identity-and-trust.md](./identity-and-trust.md), the brain's domain is canonical;
    `did:web:<domain>` is only its ATProto spelling. PDS account handles and `did:plc`
    repository identities never seed the brain's character.
14. **Generate character semantics from evidence, not a fixed archetype lottery.** Role,
    purpose, and values are generated once from a bounded factual brief of active
    capabilities and synced content signals, validated structurally, and persisted.

## Problems addressed

### Profile ownership leaked into shell and sites

`professionalProfileExtension` and `baseProfileExtension` currently live in
`shell/identity-service/src/profile-helpers.ts` and are re-exported through
`@brains/plugins`. Rover registers the professional extension locally, while personal
and professional site packages define or duplicate profile schemas.

The shell and site packages therefore own profile-domain fields that belong in a shared
profile plugin.

### Anchor kind conflated semantic and structural contracts

Before this branch, profile content used semantic-looking values:

```text
professional | team | collective
```

The shipped branch replaced them with structural values:

```text
person | team | organization
```

The revision keeps semantic kind open and composition-owned, then derives the closed
structural category. The contract crosses identity service, public plugin contracts,
A2A, ATProto, agent discovery, assessment, site schemas, seed content, onboarding, and
tests.

### Style policy was hard-coded in prompts

Durable style lived in implementation prompts:

- blog and deck voice rules;
- image medium, palette, composition, mood, and exclusions;
- `desiredTone` inside the professional-profile extension.

This couples task mechanics to one author's style and prevents one editable source from
controlling content and image generation.

### Site information mixed channel settings and presentation identity

`site-info` owns title, description, CTA, sections, theme mode, and copyright, while
site-builder separately merges anchor social links. Some sites present the anchor, some
present the brain, and some use site-specific overrides. The represented identity must
be explicit.

## Target entity model

```text
brain-character   singleton, shell-owned base identity
anchor-profile    singleton, shell-owned base identity
style-guide       singleton, entity-plugin-owned generation guidance
site-info         optional singleton, website-only channel configuration
```

### Brain identity

```yaml
name: Rover
role: Personal knowledge manager
purpose: Help capture and transform knowledge
values:
  - clarity
  - ownership
```

### Anchor profile base

`anchor-profile.md` carries profile data only. It persists neither semantic kind nor
structural category:

```yaml
name: Ada Morgan
description: Advisor on resilient systems
avatar: /assets/ada.jpg
website: https://example.com
email: ada@example.com
socialLinks: []
```

The shell-owned base stays small and stable. Existing `organization` remains an optional
relationship/display field during migration; its long-term name should be reviewed
because an organization-category anchor does not need to repeat itself.

### Profile extensions

```text
anchor-profile base fields
├── no selected kind       base fields only; no category
├── professional           category: person
├── team                   category: team
├── organization           category: organization
└── plugin-defined kinds   one closed category each
```

Base kind schemas and parsing helpers live in `@brains/profile`. External profile-kind
plugins own their additional definitions and may export consumer view schemas for sites.

#### Professional profile

Initial fields:

- `tagline`
- `intro`
- markdown body as long biography/story
- `role`
- `audience`
- `expertise`
- `currentFocus`
- `availability`

`desiredTone` moves to the style guide.

#### Team profile

Initial fields:

- `tagline`
- `intro`
- markdown body as team story
- `purpose`
- `audience`
- `focusAreas`
- `capabilities`
- `workingPrinciples`

Do not store a live member roster in git-synced profile content. Runtime users and roles
belong to the auth/runtime plane.

#### Organization profile

Initial fields:

- `tagline`
- `intro`
- markdown body as organization story
- `mission`
- `audience`
- `focusAreas`
- `offerings`
- `values`

Add an organization-category kind only when it changes validation, behavior, or a
meaningful presentation contract.

### Style guide

Singleton path:

```text
brain-data/style-guide/style-guide.md
```

Initial schema:

```yaml
---
name: Default style guide
messaging:
  audiences:
    - climate-tech founders
  positioning: Practical systems guidance grounded in real work
voice:
  summary: Clear, practical, and quietly confident
  traits:
    - direct
    - systems-minded
  principles:
    - Prefer concrete examples over generic claims
  preferredTerms: []
  avoid:
    - consulting clichés
visual:
  artDirection: Dense contemporary editorial illustration
  palette:
    - "#3921D7"
    - "#E7640A"
  composition: Layered, interconnected, and diagonally dynamic
  mood: Intellectual maximalism
  preferred: []
  avoid:
    - photorealism
    - text rendered inside images
---
Long-form rationale, examples, and exceptions live in the markdown body.
```

The entity is not a prompt. It supplies durable context to prompt-driven tasks.

### Generation context

Every generation path declares a represented identity and supplies the style facets it
wants applied:

```text
represented identity: brain | anchor | none
styleGuide payload:    { voice?, visual? }   // omit entirely for neutral work
```

Style selection is payload-driven: the datasource injects the `voice` section when the
payload carries voice guidance and the `visual` section when it carries visual guidance.
There is no separate `style` flag — the facets present in the payload _are_ the
selection, so there is exactly one source of truth. A styled caller fetches the facets it
needs from the style guide (`formatVoiceGuidance` / `formatVisualGuidance`, or
`formatStyleGuidance(guide, "both")` for a single text+image workflow) and passes them
through; a neutral caller passes no `styleGuide` at all.

Examples:

| Workflow                               | Represented identity | Style-guide payload |
| -------------------------------------- | -------------------- | ------------------- |
| Brain-authored operational explanation | brain                | voice               |
| Professional blog post                 | anchor               | voice               |
| Team presentation                      | anchor               | voice + visual      |
| Cover image                            | anchor or brain      | visual              |
| Neutral extraction or summary          | none                 | none (omitted)      |
| Internal styled document               | brain or anchor      | voice               |

Represented identity selects facts and perspective. The style-guide payload selects
style. Explicit user instructions may override it for one request.

### Site composition

`site-info` stays optional and separate:

```yaml
represents: anchor # brain | anchor
title: Optional site-specific override
description: Optional site-specific override
themeMode: light
cta: {}
sections: {}
copyright: Optional override
```

The site derives identity/profile data from the selected singleton. CTA, sections, theme
mode, and copyright remain website concerns. Canonical URL and analytics remain runtime
configuration.

### Optional future brand

A brand is added only when neither brain nor anchor is the right public identity, such as
one organization operating several independently named products. It can consume the same
style-guide contract later. No brand is needed to complete this plan.

## Package ownership

```text
shell/identity-service
├── brain-character base
└── anchor-profile base + kind enum

plugins/profile
├── professional profile extension
├── team profile extension
├── organization profile extension
├── kind-aware validation
├── deterministic agent alias, context-generated character, and legacy-default backfill
└── profile parsing helpers

entities/style-guide
├── singleton schema and adapter
├── resolver helper/data source
└── no CRUD tools

entities/site-info
└── website-only configuration and represented-identity selection
```

Sites consume `@brains/profile`; they do not define durable profile fields. Generation
plugins consume `@brains/style-guide`. Shell does not define profile fields or style
instructions.

The canonical brain's core capability set can include profile and style-guide support
without enabling site or publishing bundles.

## Phase 1 — Canonicalize anchor kind

> Historical shipped phase. The revision's implementation phases supersede this kind
> migration; retain it only as implementation history.

0. **Sequencing gate:** the cross-version discovery conversion
   (`normalizeDiscoveredBrainCard`, landed on `work/audit-followups`) must be
   released and deployed fleet-wide before any brain publishes new-vocabulary
   cards — without it, deployed brains reject `person`/`organization` kinds at
   validation and card exchange breaks mid-rollout.
1. Change the canonical enum to `person | team | organization`.
2. Transition legacy values automatically on read:
   - `professional` → `person`;
   - `collective` → `organization`.

   **Live content repos do not have to migrate ahead of a deploy.**
   `authoredAnchorProfileKindSchema` coerces a brain's own authored
   `anchor-profile.md` kind through the alias table before the strict enum runs,
   so a deployed brain whose singleton still says `kind: collective` (rizom.ai's
   does today) reads it as `organization` on upgrade instead of failing closed to
   fallback identity. The canonical value is written back on the next serialization
   of the singleton, so content converges without a hand migration. Verify no live
   brain serves fallback identity defaults after upgrade (the backfill run's
   fingerprint check is the natural place). Seed/eval content still moves to the
   new vocabulary in step 3 so fresh installs never start on a legacy value.

3. Migrate seed/eval content, test apps, CLI output, onboarding, and docs.
4. Update plugin contracts, assessment, agent discovery, and site schemas.
5. Update ATProto records and lexicon known values, then republish the single live card.
   **Flip the discovery alias table** in `@brains/atproto-contracts` in the same
   change (`professional` → `person`, `collective` → `organization`) so upgraded
   brains keep reading cards from peers still on the legacy vocabulary.
6. Update the A2A anchor extension contract directly; no compatibility version is needed
   before stable release.

Exit gate: no source, fixture, public contract, or live card uses a legacy kind; the
discovery alias table maps legacy → new (its removal is Phase 6 cleanup, gated on the
last fleet brain reaching the new vocabulary).

## Phase 2 — Move profiles out of shell

1. Create `@brains/profile` as a shared service plugin/package.
2. Move common and professional extensions out of identity-service.
3. Add team and organization schemas.
4. Add plugin-owned kind-aware validation.
5. Replace Rover-local registration with the shared profile capability.
6. Remove profile registration/schema ownership from site packages.
7. Leave only base identity exports in identity-service and `@brains/plugins`.

The preferred validation path is a plugin-owned persistence validator exposed through the
entity namespace. Do not move variant fields into the shell base schema.

Exit gate: shell contains no profile-specific fields and all three variants round-trip.

## Phase 3 — Add first-class style guide

1. Create `@brains/style-guide` as a singleton EntityPlugin.
2. Add structured messaging, voice, and visual frontmatter plus markdown body support.
3. Add default creation after initial directory sync without overwriting imported content.
4. Add resolver helpers that return structured facets and long-form body guidance.
5. Add CMS/directory-sync round-trip coverage.
6. Migrate `desiredTone` into style-guide voice guidance.
7. Seed instance-specific style; do not make one author's style a universal framework
   default.

Exit gate: style changes require editing only `style-guide/style-guide.md`.

## Phase 4 — Compose style into generation

1. Add represented-identity and style-facet selection to shared generation contracts.
2. Update AI content generation to inject selected style-guide facets.
3. Update image generation to consume visual guidance and remove hard-coded style from
   `build-image-base-prompt.ts`.
4. Remove author-specific voice rules from blog and deck prompts after equivalent seed
   style exists.
5. Classify templates as styled, neutral, or source-style-preserving.
6. Keep extraction, assessment, and factual summaries neutral.
7. Invalidate style caches on style-guide updates.

Exit gate: content/image evals prove style is data-driven and neutral workflows stay
neutral.

## Phase 5 — Make site presentation explicit

1. Add `represents: brain | anchor` to `site-info` with a compatibility default.
2. Define fallbacks for title, description, image, social links, and narrative profile.
3. Remove duplicate profile schemas and metadata-only social-link parsing from site
   datasources.
4. Validate personal, team, and organization sites through running-app preview rebuilds.
5. Keep `site-info` absent from brains without site capability.

Exit gate: each site renders its selected identity and no generation workflow reads
site-info for style.

## Phase 6 — Cleanup

> Historical shipped cleanup. Use the revision's staged content and two-card cleanup
> gates instead.

1. Verify the kind cutover in source, fixtures, generated content, and the live
   ATProto card.
2. Remove both kind-alias tables — the discovery one in `@brains/atproto-contracts`
   and `authoredAnchorProfileKindSchema`'s in `@brains/identity-service` — only after
   every fleet brain is deployed on the new vocabulary AND every live content repo has
   re-serialized its singleton to a canonical kind (verify via fleet versions and a
   content sweep, not the calendar); both reads then fail closed on legacy kinds by
   design.
3. Remove shell profile helpers and Rover-local profile plugin.
4. Update CMS labels, Obsidian files, docs, examples, and onboarding playbooks.
5. Refresh brain-model-unification fixtures with intentional differences documented.
6. Add changesets for published package contracts.
7. Reassess brand only from real independent-identity use cases.

## Phase 7 — Seeded starter identity and legacy-default backfill

Every unauthored brain today introduces itself as "Brain, the Knowledge
assistant", which makes fleet directories and the ATProto network read as
wallpaper; the brains someone named (Metis, Paper Tiger, Phoney) are the ones
that feel alive. Seed a distinct starter identity for new brains and migrate
existing brains that still contain exact historical defaults.

Decisions:

- **Durable, content-plane identity.** The starter name and character are written into
  `brain-data` as ordinary `brain-character` and `anchor-profile` content. Identity
  service, cards, A2A, and directories consume it without a parallel runtime identity.
- **Cross both startup barriers before generation.** Bootstrap records successful initial
  content discovery first, so imported identity always wins, then waits for the normal-boot
  `system:shell:ready` lifecycle event before calling guarded AI APIs. Shell readiness is
  emitted only after ready hooks and runtime startup complete; register-only and
  startup-check modes do not emit it. Repeated bootstrap is idempotent.
- **Backfill exact legacy defaults.** After initial directory sync, a migration compares
  parsed identity values against a versioned registry of known historical defaults. It
  does not compare raw markdown formatting. The initial fingerprints include:
  - `brain-character`: `Brain`, `Knowledge assistant`, the historical default purpose,
    and the exact default values list;
  - `anchor-profile`: `Unknown`, with no additional authored profile fields or markdown
    body. During the staged transition, content kind is validated separately against the
    configured category and then excluded from the authored-data fingerprint.
- **Preserve authored and partially customized content.** Each singleton is migrated only
  when that singleton exactly matches a known default fingerprint. A customized brain
  character or anchor profile is never overwritten merely because its counterpart is
  still generic. Unknown extension fields count as authored content.
- **Keep the truthful anchor invitation.** A missing or exact-default anchor receives an
  explicit `Anchor for <brain name>` placeholder that says configuration is still needed
  and that no real person, team, or organization has been inferred. If the brain character
  is already authored, use its authored name. If the brain character itself needs AI
  generation, do not create a mismatched anchor placeholder until the complete character
  candidate validates.
- **Seed aliases from canonical brain identity only.** Hash the normalized canonical brain
  domain. Treat `did:web:<domain>` as equivalent input when necessary, but never use an
  ATProto account handle or `did:plc` repository identity. If no canonical domain exists,
  defer seeding rather than invent another identity primitive.
- **Use one safe agent-alias register for every profile posture.** A brain remains an
  agent whether its base profile has no kind or its selected kind maps to person, team,
  or organization. Use a local, versioned two-part register with the energetic cadence
  of classic alias generators. Do not call a remote service, copy an unlicensed
  third-party list, expose Wu-Tang branding, or admit violent, profane, criminal,
  demeaning, or real-member-specific terms. SHA-256 selection from the domain makes the
  alias deterministic without runtime randomness.
- **Use the canonical resolved profile classification.** Remove the second
  `starterIdentity.anchorKind` setting. When composition selects a kind, consume its
  resolved semantic kind and structural category. When no kind is selected, generate
  from base-profile context without inventing a category.
- **Generate role, purpose, and values from a bounded factual brief.** The fixed character
  archetype list is removed. For a missing or exact-default brain character, build a brief
  from the active capability/entity-type inventory and counts, resolved kind/category when
  present, authored anchor fields when present, messaging/voice guidance when present,
  and at most twelve existing topic labels, summary fields, or titles. Each content signal
  is capped at 160 characters. Do not include arbitrary markdown bodies, conversations,
  credentials, auth/runtime state, or the non-identity model labels Rover, Relay, or
  Ranger as identity evidence.
  This generation uses the brain's configured AI provider; it introduces no second remote
  naming service.
- **Constrain structured generation.** Generate `{ role, purpose, values }` through the
  shared structured-object API and a strict schema: a short functional role, one grounded
  purpose sentence, and exactly three distinct concise operating values. The prompt must
  describe the brain as an agent rather than its anchor, prohibit invented expertise or
  achievements, and prefer concrete operating behavior over decorative metaphors or
  generic virtues.
- **Validate before mutation; retry without fallback copy.** Construct and validate the
  complete candidate before replacing a missing or legacy brain character. On AI failure
  or invalid output, leave persisted identity untouched, report the deferred generation,
  and retry after a later successful initial sync or explicit onboarding action. Do not
  fall back to another handcrafted archetype list.
- **Persist once, not continuously.** AI output is not guaranteed byte-deterministic across
  clean runs. Stability comes from writing the first valid result through normal entity
  APIs and never regenerating it automatically when content, capabilities, or models
  change. Explicit future rename/regeneration is a user action.
- **A placeholder with personality, visibly an invitation.** Seeded content states that
  the brain picked its starter alias and that renaming and profile completion are expected;
  onboarding surfaces this invitation.
- **Persist through normal entity APIs.** Backfill updates flow through entity validation,
  directory-sync export, cache invalidation, and existing A2A/ATProto publication triggers.
  Once migrated, content no longer matches a legacy fingerprint.
- **Respect canonical-brain composition.** Per
  [brain-model-unification.md](./brain-model-unification.md), identity is instance-owned.
  Installed capabilities and synced content may inform generation; non-identity model
  labels, preset names, and hidden bundle identity may not.

Tests first: canonical-domain normalization, deterministic alias derivation, same-register
behavior with no kind and across built-in/external kinds, unsafe-term exclusion,
bounded-context selection and
redaction, structured-output validation, shell-ready ordering and the initial-sync/ready
dual barrier, AI failure without mutation, successful retry, fresh-repository seeding,
every known legacy fingerprint, independent singleton migration, unknown-field
preservation, partial customization, false-positive prevention, no AI call for authored
character content, and repeated-run idempotence.

Exit gate: fresh installs and brains still carrying exact historical defaults have a
distinct deterministic agent alias plus a grounded, generated character in their card,
agent card, and directory entry; authored identities are unchanged; alias generation uses
no runtime randomness; generated semantics become stable through one-time persistence.

## Post-implementation review follow-ups

Concrete, self-contained tasks from the post-implementation review. Ordered by
severity. Each is scoped so it can be picked up independently. Write the test
first in every case.

### F1 — Backfill read path fails closed on non-public identity (correctness)

**Status: completed.**

`seedOrMigrateStarterIdentity` in `plugins/profile/src/starter-identity.ts:347-356`
reads the `brain-character` and `anchor-profile` singletons via `getEntity`
**without** a `visibilityScope`. Per `shell/entity-service/src/entity-queries.ts:110`
an undefined scope fails closed to public-only. The sibling brief-builder reads the
same two singletons at `visibilityScope: "restricted"`
(`plugins/profile/src/starter-character.ts:271-274`), so the two read paths disagree.

Consequence: if a user authors either singleton as `shared` or `restricted`, the
backfill reads `null`, concludes the identity is missing, and takes the **create**
branch — duplicating or overwriting authored identity. Latent today because entities
default to `public`.

Fix: pass `visibilityScope: "restricted"` on both `getEntity` calls at
`starter-identity.ts:348` and `:352`, matching the brief-builder.

Test first: author a non-public `anchor-profile` (or `brain-character`), run the
backfill, and assert the authored singleton is neither overwritten nor duplicated
(no create-branch call). This closes the coverage gap noted below.

### F2 — Exclude non-identity model labels from the character brief (plan conformance)

**Status: completed.** These are identity-evidence exclusions, not a compatibility
layer.

Per decisions in Phase 7, the non-identity model labels Rover, Relay, and Ranger must
not enter the factual brief **as evidence**. Credentials, auth state, and conversations
are excluded structurally, but a `topic`/`summary`/`title` whose text contains one of
those labels flowed verbatim into `contentSignals` in
`plugins/profile/src/starter-character.ts` (`collectContentSignals`, ~`:207-243`,
serialized ~`:292-311`). The prior defense was only a prompt line
(`Do not use non-identity brain-model names as identity evidence`, ~`:306`).

Fix: apply a structural redaction/exclusion pass on collected content signals against
the known non-identity model-label set before serialization, so the constraint does not
rely on prompt compliance.

Test first: a content signal containing a non-identity model label is excluded from (or
redacted in) the serialized brief.

### F3 — Add deck style-wiring test coverage (test gap)

**Status: completed.**

`entities/decks/src/handlers/deckGenerationJobHandler.ts` fetches the style guide
and passes `representedIdentity: "anchor"` / `style: "voice"` plus voice guidance
(~`:120-161`), but there is no `entities/decks/test/handlers/` coverage. Blog and
social-media handler tests were updated to assert these flags; deck was missed.

Fix: add a deck generation-handler test asserting the represented-identity/style
flags and that non-empty voice guidance populates the `styleGuide` payload.

### F4 — Reconcile CMS frontmatter schema with the persist validator (soundness)

**Status: completed.** Kind-aware schema refinements now survive frontmatter
extension merging, and CMS condition metadata hides fields that do not apply to
the selected anchor kind.

`plugins/profile/src/schemas.ts` registered `profileFrontmatterExtension` as a
flat, non-strict union of all variant fields, while `validateProfileContent`
enforced a strict per-kind schema. The CMS
editor therefore accepts fields (e.g. `mission` on a `kind: person` profile) that
the persist validator then rejects. The validator is the correct gate; the editor
should not advertise fields it cannot save.

Fix: make the CMS-facing frontmatter schema kind-aware (or otherwise narrow it) so
editing surfaces only fields the persist validator accepts. Confirm the base schema
(`kind`/`name`) is merged into the editing schema.

### F5 — Guidance body duplicated when `style: "both"` with both facets (latent)

**Status: completed.**

`formatVoiceGuidance` and `formatVisualGuidance` in
`entities/style-guide/src/resolver.ts` each append `styleGuide.guidance`
(~`:40`, `:55`). A future `style: "both"` caller that populates both `voice` and
`visual` strings would get the markdown body twice in the system prompt. No current
caller hits this, but the datasource `"both"` branch
(`shell/core/src/datasources/ai-content-datasource.ts:174-181`) is designed to
accept both.

Fix: append the shared `guidance` body once when composing `"both"`, not per facet.

### F6 — Classify remaining unclassified generation paths (Phase 4 step 5)

**Status: completed.** Note and series generation are explicitly neutral;
portfolio and newsletter generation represent the anchor and consume voice
guidance; source-derived deck descriptions and blog excerpts preserve source
style without injected identity.

Phase 4 step 5 ("classify templates as styled, neutral, or source-style-preserving")
was not applied to several callers that omit `representedIdentity` and therefore
inherit the default that injects **both** brain and anchor identity: note
(`entities/note/src/handlers/noteGenerationJobHandler.ts:65`), portfolio,
series, newsletter, and the `decks:description` eval (`entities/decks/src/plugin.ts:261`). Notably
`decks:description`'s template says "Match the voice of the presentation"
(source-style-preserving intent) yet gets brain+anchor identity injected.

Fix: set an explicit `representedIdentity`/`style` on each of these paths per its
intent (`decks:description` is source-style-preserving → `representedIdentity: "none"`).

## Validation

- identity/profile/style-guide schema and adapter tests;
- markdown round-trip and unknown-field preservation tests;
- zero-kind and config-selected profile persistence tests;
- app-scoped catalog registration, collision, finalization, and boot-order tests;
- A2A v1/v2 and ATProto old/new card contract tests;
- agent-discovery and assessment contract tests;
- generation prompt assembly tests for voice, visual, and neutral contexts;
- image tests proving visual guidance is data-driven;
- blog/deck evals proving voice is data-driven;
- generic and kind-specialized site view tests, including typed extension fields;
- deterministic alias, bounded character-generation, and strict legacy-default migration tests;
- targeted workspace typecheck, tests, and lint;
- full shared-contract checks when public contracts move;
- running-app preview rebuild before inspecting generated site output;
- `bun run docs:check` whenever roadmap/docs links change.

## Acceptance criteria

- Base profiles work with no selected kind and persist only profile data.
- Optional semantic kind is selected only in `brain.yaml`; neither kind nor category is
  persisted in `anchor-profile.md`.
- The app-scoped catalog is open to external kinds, while category remains the closed
  `person | team | organization` vocabulary.
- Kind selects profile schema and category is derived exactly once at the pre-sync
  finalization barrier.
- Unknown or colliding selected kinds abort boot without fallback identity mutation.
- Generic sites render common profile views; specialized sites retain typed access to
  extension fields.
- New ATProto cards expose open semantic kind and closed structural category; both
  currently published cards are republished and verified after reader-first rollout.
- Typed card publication fails clearly when no kind is selected.
- Shell owns no profile-specific or style-guide fields.
- Base kind definitions live in `@brains/profile`; external plugins may add kinds.
- No persisted `profileType` exists.
- One first-class singleton style guide owns editable messaging, voice, and visual guidance.
- Task prompts contain no instance-specific voice, palette, composition, or art direction.
- Styled generation consumes the guide; neutral generation does not.
- Site presentation works without owning identity or generation style.
- Brains without sites retain complete identity, profile, and style-guide support.
- No mandatory brand entity exists.
- Fresh brains receive a deterministic safe agent alias and one-time context-generated
  character after imported content is checked.
- Agent naming is independent of whether no kind is selected or the selected kind maps
  to person, team, or organization.
- Generated role, purpose, and values are grounded in bounded capability/content signals,
  validated before persistence, and never silently replaced after creation.
- Exact known legacy defaults are backfilled while authored and partially customized
  identities remain unchanged.

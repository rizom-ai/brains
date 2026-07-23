# Plan: Identity Profiles, Style Guide, and Site Composition

## Status

Implemented in the repository, including the revised Phase 7 safe deterministic agent aliases, bounded structured character generation, and strict legacy-default backfill. Deployment, live backfill, and republication of the existing ATProto card remain operational follow-up work.

This plan concerns git-synced, markdown-backed identity and generation guidance. Runtime
users, authentication, roles, and authorization remain owned by the runtime identity
plans.

Related plans:

- [brain-model-unification.md](./brain-model-unification.md) — profile and style-guide
  capabilities must work in the canonical brain rather than remain model-specific.
- [identity-and-trust.md](./identity-and-trust.md) — runtime subjects, domain identity,
  trust, and authorization remain separate from public content profiles.

## Goal

Create one coherent model for:

- the brain's own identity;
- the person, team, or organization anchoring the brain;
- kind-specific anchor profiles;
- one first-class style guide for textual and visual generation;
- website presentation without making a site mandatory;
- an optional future brand identity without introducing one before it is needed.

Success means prompts describe tasks and output formats, while durable identity and style
choices live in editable markdown entities owned by plugins.

## Settled decisions

1. **Keep two universal identity subjects.** `brain-character` describes the brain;
   `anchor-profile` describes who or what anchors it.
2. **Anchor kind is `person | team | organization`.** Do not add `profileType`.
3. **All anchor profiles extend `anchor-profile`.** Professional, team, and organization
   profiles are schemas registered against the singleton, not separate entity types.
4. **Shell owns only base identity contracts.** Profile fields and validation live in an
   opt-in plugin.
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
11. **Use a strict cutover for content, with a discovery conversion window for the
    fleet.** Migrate all controlled content and republish the single live ATProto
    card. Deployed brains validate discovered cards with `knownValues` enforced as
    a closed enum, and fleet versions upgrade at different times — so cross-version
    kind conversion at the discovery boundary (`normalizeDiscoveredBrainCard` in
    `@brains/atproto-contracts`) is load-bearing during the rollout. The cutover
    **flips** its alias table (`professional` → `person`, `collective` →
    `organization`) rather than deleting it; the no-aliases end state applies to
    content and public contracts immediately, and to the discovery table only after
    every fleet brain is on the new vocabulary.
12. **Backfill defaults without touching authored identity.** Fresh brains and existing
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

### Anchor kind used a legacy contract

The previous values were:

```text
professional | team | collective
```

The target values are:

```text
person | team | organization
```

`professional` becomes a profile extension applicable to a `person` anchor. Current
collective fixtures must be audited and migrated to `team` or `organization`.

The kind contract crosses identity service, public plugin contracts, A2A, ATProto, agent
discovery, assessment, site schemas, seed content, onboarding, and tests.

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

```yaml
name: Ada Morgan
kind: person # person | team | organization
description: Advisor on resilient systems
avatar: /assets/ada.jpg
website: https://example.com
email: ada@example.com
socialLinks: []
```

The shell-owned base stays small and stable. Existing `organization` remains an optional
relationship/display field during migration; its long-term name should be reviewed
because an organization-kind anchor does not need to repeat itself.

### Profile extensions

```text
anchor-profile
├── professional-profile   kind: person
├── team-profile           kind: team
└── organization-profile   kind: organization
```

All extension schemas and parsing helpers live in `@brains/profile`.

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

Do not add organization subtypes until they change validation or behavior.

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

Every generation path declares whether it is styled:

```text
represented identity: brain | anchor | none
style: voice | visual | both | none
```

Examples:

| Workflow                               | Represented identity | Style          |
| -------------------------------------- | -------------------- | -------------- |
| Brain-authored operational explanation | brain                | voice          |
| Professional blog post                 | anchor               | voice          |
| Team presentation                      | anchor               | voice + visual |
| Cover image                            | anchor or brain      | visual         |
| Neutral extraction or summary          | none                 | none           |
| Internal styled document               | brain or anchor      | voice          |

Represented identity selects facts and perspective. The singleton style guide selects
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

0. **Sequencing gate:** the cross-version discovery conversion
   (`normalizeDiscoveredBrainCard`, landed on `work/audit-followups`) must be
   released and deployed fleet-wide before any brain publishes new-vocabulary
   cards — without it, deployed brains reject `person`/`organization` kinds at
   validation and card exchange breaks mid-rollout.
1. Change the canonical enum to `person | team | organization`.
2. Migrate controlled legacy values:
   - `professional` → `person`;
   - `collective` → audited `team` or `organization`.

   **Live content repos migrate in the same window as each brain's version
   upgrade.** The new `anchorProfileKindSchema` is a hard enum with no legacy
   tolerance: a deployed brain whose authored `anchor-profile.md` still says
   `kind: collective` (rizom.ai's does today) fails singleton parsing on upgrade
   and silently serves fallback defaults — putting "Unknown" back on the
   published card through a different door. Per-brain deploy choreography:
   migrate the content repo's kind values, then (or simultaneously) deploy the
   cutover release; afterwards verify no live brain serves fallback identity
   defaults (the backfill run's fingerprint check is the natural place).

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

1. Verify the strict kind cutover in source, fixtures, generated content, and the live
   ATProto card.
2. Remove the discovery kind-alias table from `@brains/atproto-contracts` — only after
   every fleet brain is deployed on the new vocabulary (verify via fleet versions, not
   the calendar); discovery then fails closed on legacy kinds by design.
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
  - `anchor-profile`: `Unknown`, `kind: person`, with no additional authored fields or
    markdown body.
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
- **Use one safe agent-alias register for every anchor kind.** A brain remains an agent
  whether its anchor is a person, team, or organization. Use a local, versioned two-part
  register with the energetic cadence of classic alias generators. Do not call a remote
  service, copy an unlicensed third-party list, expose Wu-Tang branding, or admit violent,
  profane, criminal, demeaning, or real-member-specific terms. SHA-256 selection from the
  domain makes the alias deterministic without runtime randomness.
- **Use the canonical configured anchor kind.** Adjacent auth/runtime work makes anchor
  kind configuration-owned. Consume the resolved `person | team | organization` value
  rather than maintaining a second profile-plugin kind setting when that contract lands.
  The content/profile vocabulary in this plan remains `person | team | organization`; it
  must be reconciled explicitly with any unmerged plan using different labels.
- **Generate role, purpose, and values from a bounded factual brief.** The fixed character
  archetype list is removed. For a missing or exact-default brain character, build a brief
  from the active capability/entity-type inventory and counts, the configured anchor kind,
  authored anchor fields when present, messaging/voice guidance when present, and at most
  twelve existing topic labels, summary fields, or titles. Each content signal is capped
  at 160 characters. Do not include arbitrary markdown bodies, conversations, credentials,
  auth/runtime state, or a legacy Rover/Relay/Ranger model label as identity evidence.
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
  Installed capabilities and synced content may inform generation; legacy model/preset
  names and hidden bundle identity may not.

Tests first: canonical-domain normalization, deterministic alias derivation, same-register
behavior across anchor kinds, unsafe-term exclusion, bounded-context selection and
redaction, structured-output validation, shell-ready ordering and the initial-sync/ready
dual barrier, AI failure without mutation, successful retry, fresh-repository seeding,
every known legacy fingerprint, independent singleton migration, unknown-field
preservation, partial customization, false-positive prevention, no AI call for authored
character content, and repeated-run idempotence.

Exit gate: fresh installs and brains still carrying exact historical defaults have a
distinct deterministic agent alias plus a grounded, generated character in their card,
agent card, and directory entry; authored identities are unchanged; alias generation uses
no runtime randomness; generated semantics become stable through one-time persistence.

## Validation

- identity/profile/style-guide schema and adapter tests;
- markdown round-trip and unknown-field preservation tests;
- kind-aware profile persistence tests;
- A2A and ATProto canonical-contract tests;
- agent-discovery and assessment contract tests;
- generation prompt assembly tests for voice, visual, and neutral contexts;
- image tests proving visual guidance is data-driven;
- blog/deck evals proving voice is data-driven;
- personal, team, and organization site tests;
- deterministic alias, bounded character-generation, and strict legacy-default migration tests;
- targeted workspace typecheck, tests, and lint;
- full shared-contract checks when public contracts move;
- running-app preview rebuild before inspecting generated site output;
- `bun run docs:check` whenever roadmap/docs links change.

## Acceptance criteria

- Canonical anchor kind is `person | team | organization`.
- No legacy kind remains in source, fixtures, public contracts, or the live card.
- Shell owns no profile-specific or style-guide fields.
- Professional, team, and organization profiles are plugin-defined extensions.
- No persisted `profileType` exists.
- One first-class singleton style guide owns editable messaging, voice, and visual guidance.
- Task prompts contain no instance-specific voice, palette, composition, or art direction.
- Styled generation consumes the guide; neutral generation does not.
- Site presentation works without owning identity or generation style.
- Brains without sites retain complete identity, profile, and style-guide support.
- No mandatory brand entity exists.
- Fresh brains receive a deterministic safe agent alias and one-time context-generated
  character after imported content is checked.
- Agent naming is independent of whether the configured anchor is a person, team, or
  organization.
- Generated role, purpose, and values are grounded in bounded capability/content signals,
  validated before persistence, and never silently replaced after creation.
- Exact known legacy defaults are backfilled while authored and partially customized
  identities remain unchanged.

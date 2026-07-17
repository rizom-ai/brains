# Plan: LinkedIn Import

## Status

In progress on `work/professional-profile-v2`. Phase 1A's additive profile schema and
site fallbacks are implemented. Phase 1B's communication-preferences contract,
instruction wiring, public-projection boundary, onboarding ownership change, and
non-destructive legacy-data migration are implemented. Phase 2A's sanctioned PROFILE
snapshot client, deterministic mapper, merge-not-clobber job, confirmation-gated preview
tool, and Rover wiring are implemented. Rich professional-history domains and later
phases are not yet started.

## Context

We want to lower the cost of moving from LinkedIn (LI) into a brain. The naive assumption
— "call the LinkedIn API" — does not hold, and the constraint drives the whole design:

- **LinkedIn's public API gives only basic identity** (OpenID Connect `profile`/`email` →
  `/v2/userinfo`: name, photo, email, headline). Work history, skills, education, and
  connections are not available through it.
- **Third-party scrapers are a dead end.** Proxycurl — the long-time go-to — was sued by
  LinkedIn and shut down (July 2026). The scraper market is legally unstable, per-lookup
  priced, and ToS-violating. Not a foundation for onboarding.
- **The sanctioned path is the DMA Member Data Portability (3rd Party) API.** LinkedIn was
  compelled to build it under EU Digital Markets Act Article 6(9). A member consents via
  3-legged OAuth, and the app pulls their data. This is exactly the "user authorizes a
  third party" model we want.
  - **EEA members only.** Only European Economic Area accounts can consent through this
    API — LinkedIn refuses non-EEA members at the consent step. Non-EEA users need the
    manual export-ZIP fallback. (GDPR Art. 20's export is a right everywhere; DMA's
    real-time API is EEA-only.)
  - Endpoints: **Member Snapshot API** (point-in-time full data by domain) and **Member
    Changelog API** (ongoing events, **28-day** query window).
  - Access requires a one-time developer-app approval (Company Page association + business
    verification). Scope: `r_dma_portability_3rd_party`.

**Snapshot API shape** (confirmed against the LinkedIn docs):

```
GET https://api.linkedin.com/rest/memberSnapshotData?q=criteria[&domain=PROFILE]
Headers: Authorization: Bearer <token>   Linkedin-Version: 202312
→ { elements: [ { snapshotDomain: "PROFILE", snapshotData: [ { "First Name": "Tom",
    "Last Name": "Cruise", "Headline": "...", "Summary": "...", "Industry": "...",
    "Geo Location": "...", "Websites": "..." } ] } ], paging: {...} }
```

Keys are human-readable title-case strings with spaces. Response is paginated; loop until
"No data found for this memberId". Other domains: `POSITIONS`, `EDUCATION`, `SKILLS`,
`CERTIFICATIONS`, etc.

**The import target already exists.** Owner identity lives in the shell, not a plugin:

- `anchor-profile` — singleton entity, "the profile of the brain's anchor owner"
  (`shell/identity-service/src/anchor-profile-schema.ts`, `AnchorProfileService`). Loaded
  at bootstrap; already consumed by the site, agent-service, and brain-instructions.
- `professionalProfileExtension` — opt-in schema extension parsed from the same
  `anchor-profile` content (`shell/identity-service/src/profile-helpers.ts`), consumed by
  `sites/professional` datasources. A brain model opts in via
  `context.entities.extendFrontmatterSchema("anchor-profile", professionalProfileExtension)`
  (see `brains/rover/src/profile-extension.ts`).

So LinkedIn import writes into `anchor-profile`; no new profile entity is needed.

`brain-character` is a separate singleton with `{ name, role, purpose, values }`. It
represents the brain itself, not its owner. The current Rover onboarding flow stores the
operator's intended content readership (`audience`) and output style (`desiredTone`) on
`anchor-profile`, even though those are communication defaults rather than public profile
facts. They are also not currently loaded by `AnchorProfileService`, whose base parser
only exposes the base profile schema. Phase 1B moves their ownership to an explicit
communication-preferences block associated with brain character while preserving legacy
profile fields during migration.

## Goal

A brain owner connects their LinkedIn account once and their professional identity —
name, headline, industry, location, skills, positions, education, certifications — lands
in their `anchor-profile`, from where profile and site consumers can read it. The import
is idempotent and merge-not-clobber (re-running enriches; it never overwrites deliberate
hand-edits). EEA owners use the sanctioned DMA API; others use a manual export upload.
Communication defaults remain independent of LinkedIn import and are consumed as brain
behavior rather than published owner-profile data.

## Non-goals

- **Connections / other people's data.** The professional _profile_ only. Importing the
  owner's network (other members' PII) is a separate initiative with its own consent and
  privacy story.
- **A generic "any provider" connector.** This is LinkedIn-specific, but built behind a
  pluggable-source seam so other sources can be added later.
- **Third-party scraper integration.** Explicitly rejected (see Context).
- **Multi-tenant token storage.** Each user runs their own brain → a single owner token
  per brain, stored like any other integration credential.

## Architecture

### Identity ownership boundary

| Contract                                   | Owns                                                                                                   | Does not own                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `brain-character`                          | The brain's `name`, brain `role`, `purpose`, and behavioral `values`                                   | The owner's profession or imported LinkedIn history |
| `brain-character.communicationPreferences` | Default content `audience` and output `tone`, overridable per task/channel                             | Public profile facts; values or permissions         |
| `anchor-profile`                           | The owner's public identity, professional `role`/`headline`, narrative, curated expertise, and history | Agent/output preferences or the brain's persona     |
| `positions[].title`                        | A role the owner held at one organization                                                              | The brain's role                                    |

`values` and communication tone remain distinct: values guide decisions and behavior;
tone controls presentation. The role fields are contextual rather than interchangeable:
`brain-character.role` is the brain's job, `anchor-profile.role` is the owner's concise
working identity, `headline` is the owner's public-facing statement, and
`positions[].title` belongs to one organization.

### Import pipeline

A staged pipeline, mirroring the existing `directory-sync` ETL shape and the `stock-photo`
external-API plugin template:

```
SOURCES (pluggable adapters)          TRANSFORM              SINK
────────────────────────────          ─────────              ────
① MDP Snapshot API   (EEA)   ─┐
② Export ZIP upload  (non-EEA)─┼──► deterministic map  ──► merge into anchor-profile
③ MDP Changelog API  (≤28d)  ─┤     + LLM distillation      (singleton, idempotent,
④ OAuth userinfo     (basic) ─┘                              merge-not-clobber)
```

- **Separate structural from semantic translation.** Deterministic key-normalization
  (LI keys → canonical schema) fills the structured record with zero LLM. A distinct,
  optional LLM pass distills presentation fields (`story`, `tagline`, `intro`) _from_ the
  structured record. A source-provided `headline` remains deterministic. Never LLM the
  whole thing inline.
- **Auth is a prerequisite, not the plugin's job.** The plugin consumes a stored token;
  the OAuth consent flow lives at the interface (web) layer. Phase 1–2 use a static token
  in `brain.yaml` (like `UNSPLASH_ACCESS_KEY`); the browser callback + refresh is a later
  phase.
- **Write path gotcha.** `SingletonEntityService` has no public setter and
  `AnchorProfileAdapter.createProfileContent()` validates against the _base_ schema
  (strips extension fields). Extension fields must be written by building frontmatter
  directly (the `fromMarkdown` path preserves them), then `refreshCache()` — or via the
  entity's `extendFrontmatterSchema` registration. Confirm the cache-invalidation trigger
  (explicit `refreshCache` vs `entity:updated` subscription) during implementation.

## Phase 1A — Additive professional profile schema

Prepares the import target without breaking existing profiles. Independent of the plugin;
shippable on its own.

Extend `professionalProfileExtension` (`shell/identity-service/src/profile-helpers.ts`)
with provider-neutral, camel-cased professional fields. Base narrative fields (`tagline`,
`intro`, `story`) stay. `headline` is a public professional statement, not a replacement
for the brain's role. The importer maps LI `Headline`→`headline`, `Summary`→`story`, and
`First/Last Name`→`name` only when the corresponding owner-authored value is absent.

New extension fields (all optional):

```
headline        string          (LI: Headline)
industry        string          (LI: Industry)
location        string          (LI: Geo Location)
skills          string[]        (LI: Skills; broad/importable capabilities)
positions       Position[]      (LI: Positions)
education       Education[]      (LI: Education)
certifications  Certification[] (LI: Certifications)

Position:      { companyName, title, description?, employmentType?, location?, startedOn?, finishedOn? }
Education:     { schoolName, degreeName?, fieldOfStudy?, startedOn?, finishedOn?, notes? }
Certification: { name, issuingOrganization?, issuedOn?, expiresOn?, credentialId?, credentialUrl? }
```

`expertise` remains distinct from `skills`: expertise is the owner's curated claim about
areas of authority; imported skills may be broader and noisier. `role`, `currentFocus`,
and `availability` also remain valid owner-profile fields. Existing `audience` and
`desiredTone` remain accepted during the compatibility window, but new code does not use
them as the source of communication behavior. Exact source
keys and partial-date formats must be confirmed against captured Snapshot/export fixtures
before the nested contracts are frozen.

Files:

- `shell/identity-service/src/profile-helpers.ts` — additive schema + nested item schemas
  (explicit `z.ZodObject` types, repo style).
- `shell/identity-service/test/profile-helpers.test.ts` — legacy + new-shape coverage
  (written first).
- `sites/professional/test/professional-profile-schema.test.ts` — assert both curated and
  imported professional fields (written first).
- `sites/professional/src/templates/about.tsx` — render curated Expertise and imported
  Skills distinctly; preserve current-focus/availability rendering.
- `sites/professional/src/templates/homepage-list.tsx` — keep curated expertise as the
  homepage signal; use skills only as a fallback when expertise is absent.

Verify: `bun scripts/lint.mjs --force --filter @brains/identity-service --filter
@brains/site-professional`, then typecheck + `bun test` for both packages.

## Phase 1B — Communication preferences and compatibility migration

Add an optional, explicitly non-profile communication block to brain character:

```
communicationPreferences:
  audience?: string  # default content readership
  tone?: string      # default output/response tone
```

These are defaults, not immutable persona fields: a task, content series, template, or
channel can override them. `brain-character.role` continues to describe the brain's job;
`anchor-profile.role` describes the owner's general professional identity, while
`positions[].title` records organization-specific roles.

Work:

- Extend the brain-character schema/service and instruction builder so communication
  defaults are actually supplied to the agent separately from identity values.
- Change Rover onboarding into three clear concerns: brain identity, owner profile, then
  communication defaults. Stop writing new `audience`/`desiredTone` values to
  `anchor-profile`.
- Preserve legacy profile fields on read/write. Rover's profile capability now runs an
  idempotent migration after plugins are ready, copying
  `anchor-profile.audience`→`brain-character.communicationPreferences.audience` and
  `anchor-profile.desiredTone`→`brain-character.communicationPreferences.tone` only when
  the destination is absent; it does not delete the source fields.
- Keep the public brain-character projection limited to `{ name, role, purpose, values }`
  unless a separate decision intentionally exposes communication defaults.
- Add focused identity-instruction, onboarding, migration, and cache-invalidation tests.

LinkedIn import must neither read nor write communication preferences.

## Phase 2A — `linkedin-import` PROFILE walking skeleton (implemented)

`plugins/linkedin-import` is a ServicePlugin templated on `stock-photo`:

- `env-schema.ts` declares sensitive `LINKEDIN_ACCESS_TOKEN`; the plugin is inert without
  it.
- `lib/linkedin-client.ts` calls the sanctioned Snapshot API with bearer auth and the
  endpoint's fixed `Linkedin-Version: 202312`, validates responses with Zod, follows
  pagination, and bounds surfaced error bodies.
- `lib/transform/registry.ts` provides the domain→mapper seam and currently registers only
  `PROFILE`, the one domain whose exact source keys are documented and captured in-repo.
- `lib/transform/profile-mapper.ts` deterministically maps documented PROFILE keys to
  `name`, `headline`, `industry`, `location`, `website`, and `story`.
- `handlers/linkedin-import-handler.ts` fetches the singleton, fills absent fields or known
  untouched seed placeholders, preserves owner-authored values, uses optimistic
  concurrency, and relies on the normal
  `entity:updated` cache-invalidation path. Re-running unchanged data performs no write.
- `tools/index.ts` exposes the anchor-only, write-marked `linkedin-import_import` tool. Its
  initial call fetches and displays the deterministic merge preview; only the host's typed,
  token-bound confirmation call can queue the import job.
- Rover includes the inert capability in each preset and supplies the access token from
  its declared environment schema.

Tests cover the official PROFILE-shaped fixture, API headers/pagination/errors, pure
mapping and merging, idempotent handler behavior, conflict handling, preview and forged
confirmation behavior, tool queuing, and inert/configured plugin wiring.

## Phase 2B — Rich professional domains

Capture representative sanctioned Snapshot/export fixtures before enabling
`POSITIONS`, `EDUCATION`, `SKILLS`, or `CERTIFICATIONS`. Add one deterministic mapper per
domain, register it through the existing transform registry, and merge arrays by stable
provider-neutral fingerprints. Do not guess source keys from display labels or third-party
export examples.

## Phase 3 — LLM distillation pass

Optional second pass that distills presentation fields (`tagline`/`intro`/`story`) from
the structured record + LI `Summary`. A LinkedIn-provided `headline` stays deterministic
and is not silently rewritten by the LLM. The pass is gated behind review, re-runnable,
and never inline on the deterministic path.

## Phase 4 — OAuth consent + token refresh (interface layer)

Replace the static `brain.yaml` token with the real 3-legged OAuth flow: a web callback
endpoint captures the `code`, exchanges for access + refresh tokens, stores them in the
brain's secret store. Refresh keeps the token valid for scheduled Changelog pulls. Confirm
refresh-token availability for `r_dma_portability_3rd_party` when applying for access.

## Phase 5 — Export-ZIP fallback source (non-EEA)

Second source adapter: unpack an uploaded LinkedIn data export, parse the CSVs, feed the
_same_ transform + sink. Selected when the member is not EEA-eligible.

## Later / deferred

- **Changelog sync** — scheduled job (≤28-day cadence) to keep the profile current.
- **Richer entities** — route raw `positions`/`education` to their own homes
  (`portfolio/project`, etc.) and render a timeline on the about page.
- **Connections import** — separate initiative (privacy/consent for others' data).

## Key decisions

- **Target `anchor-profile`, not a new entity** — it already exists in the shell and is
  already consumed; a new profile entity would duplicate it.
- **Provider-neutral canonical fields** — use clear professional vocabulary in repo style;
  LinkedIn adapters translate source keys into it rather than making the durable contract
  mirror one provider's payload.
- **Identity/profile/preferences are separate concerns** — brain character defines the
  brain, anchor profile defines the owner, and communication preferences define default
  readership/tone. LinkedIn import only enriches the owner profile.
- **Additive compatibility window** — retain populated legacy profile fields while new
  consumers move to the clearer contracts; migration is explicit and non-destructive.
- **Single owner token per brain** — each user runs their own brain; no multi-tenancy.
- **Deterministic first, LLM second** — structured record is deterministic; only narrative
  fields use an LLM, as a separate optional pass.
- **DMA API primary (EEA), export-ZIP fallback (rest)** — sanctioned and stable beats
  scraping; both feed one pipeline behind a pluggable-source seam.

## Risks / constraints

- **EEA-only** DMA access — non-EEA owners are export-only until (unless) LinkedIn widens
  portability.
- **Developer-approval gate** — one-time but not instant; start the application early since
  it blocks phases 2–4.
- **28-day Changelog window** — continuous sync must run inside it with a valid (refreshed)
  token.
- **Write-path/cache** — extension-field write + singleton cache invalidation must be
  verified (see Architecture).
- **Preference migration** — legacy profile `audience`/`desiredTone` data remains in place
  after the idempotent copy into brain-character communication preferences; automatic
  source deletion would risk losing user intent.

# Plan: LinkedIn Import

## Status

Partial — in progress on `work/professional-profile-v2`. Phase 1A's additive profile
schema and site fallbacks are implemented. Phase 1B's communication-preferences contract,
instruction wiring, public-projection boundary, onboarding ownership change, and
non-destructive legacy-data migration are implemented. Phase 2A's sanctioned PROFILE
snapshot client, deterministic mapper, merge-not-clobber job, confirmation-gated preview
backend, and Rover wiring are implemented. Phase 2B schema inspection is implemented
without exposing member values, and provider-neutral rich-record fingerprint merging is
implemented. Phase 3's reviewed narrative-distillation backend is implemented but
dormant. Phase 4A's sanctioned OAuth authorization-code client, direct/self-hosted browser
routes, expiring single-use state, dynamic importer token provider, private-file token
store, and Rover wiring are implemented. LinkedIn agent tools and the interim standalone
management page have been removed. The dedicated `/admin` console's Integrations section
is the intended import surface, and its LinkedIn UI plus preview/confirmation workflow
remain pending. Phase 4B's provider-neutral broker walking skeleton is implemented with
authenticated instances, exact return-URI lookup, expiring state, and one-time grants.
The LinkedIn provider adapter, owner-side broker client, local return route, and reusable
token handoff are implemented. Central deployment wiring and Admin UI remain pending;
LinkedIn scopes, token exchange, and credential validation stay provider-specific.
Rich-domain fixtures/mappers and Phase 5 are not yet started.

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
- **A generic "any provider" data connector.** Profile extraction and mapping remain
  LinkedIn-specific behind the existing pluggable-source seam. The managed OAuth broker's
  callback/grant mechanics may be provider-neutral, but it does not normalize provider
  data or provider-specific OAuth semantics.
- **Third-party scraper integration.** Explicitly rejected (see Context).
- **Durable central token custody.** Each user runs their own brain, and the reusable owner
  token is stored there like any other integration credential. A managed broker may hold
  an exchanged credential only behind a short-lived, single-use grant until the
  originating brain redeems it.

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
- **Auth has explicit browser, broker, and provider boundaries.** The importer consumes a
  stored token. Thin status/connect/callback/disconnect routes remain on the LinkedIn
  service plugin rather than introducing another `InterfacePlugin`. Self-hosted brains can
  exchange LinkedIn codes directly. Managed brains delegate callback correlation and
  one-time credential delivery to a central broker, while LinkedIn authorization URLs,
  scopes, token response validation, and refresh behavior stay in a provider adapter. A
  static environment token remains a migration/development fallback.
- **The workflow is admin-console-first, not agent-driven.** LinkedIn is an Integrations
  section in the dedicated `/admin` React console introduced by the auth workstream, with
  People as that console's first section. It is not a dashboard widget or part of CMS,
  because connecting an account and running an operational import are mutating management
  actions rather than monitoring or content authoring. `plugins/linkedin-import` owns the
  browser-safe API and provider logic but renders no standalone management page. No
  LinkedIn MCP/chat tools are registered.
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

- The plugin is inert without a configured static or dynamic access-token source. OAuth
  and fallback-token settings come from instance-owned plugin config in `brain.yaml`, with
  normal `${ENV_VAR}` interpolation for secrets; Rover does not enumerate plugin env vars.
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
- The deterministic preview contract carries a canonical SHA-256 digest of the mapped
  patch and anchor-profile baseline. Execution refetches both and rejects stale approval
  when either input changed. The former agent tool surface has been removed; the Admin
  console's Integrations section will display the field-level merge preview and submit the
  reviewed digest through Anchor-gated LinkedIn routes before queuing the existing job.
- Rover includes the inert capability in each preset and injects only runtime boundaries
  such as Anchor session resolution and token persistence. Each instance owns the plugin's
  operational config.

Tests cover the official PROFILE-shaped fixture, API headers/pagination/errors, pure
mapping and merging, idempotent handler behavior, conflict handling, stale digest
rejection, absence of agent tools, and inert/configured plugin wiring. Panel preview and
confirmation-route tests are required when that workflow lands.

## Phase 2B — Rich professional domains

The client supports `POSITIONS`, `EDUCATION`, `SKILLS`, and `CERTIFICATIONS`, and the
schema summarizer reports only source field names, value types, occurrence counts, record
counts, and deduplicated redacted record shapes—never member values or nested object keys.
Safe placeholders distinguish dates, timestamps, URLs, URNs, emails, and
primitive/container types. This provides a privacy-preserving way to capture real
sanctioned API shapes and value-format contracts. It has no agent tool surface; an
Anchor-only advanced diagnostic in Admin's Integrations section or an explicit development
command may expose it when sanctioned fixture capture begins.

Before enabling those domains for import:

1. Run schema inspection with `domain: "ALL_RICH"` against representative consenting
   accounts (or inspect one domain at a time).
2. Turn the observed contracts into redacted Snapshot/export fixtures.
3. Add one deterministic mapper per domain through the transform registry.
4. Enable each domain only after its mapper passes fixture-backed contract tests. The
   registry is the single enablement point: preview and execution fetch every registered
   domain automatically, while unregistered domains remain inspection-only.

Provider-neutral fingerprints and append-only array merging are already implemented for
skills, positions, education, and certifications. Matching owner-authored records are
preserved rather than enriched or overwritten, while records with new identities append.
Do not guess source keys from display labels or third-party export examples.

## Phase 3 — LLM distillation backend (implemented but dormant)

The optional, re-runnable second pass over the current structured profile and imported
summary/story uses structured AI generation to propose bounded `tagline`, `intro`, and
`story` values. It explicitly excludes `headline` from its output contract and warns the
model to treat profile content as data rather than instructions.

The proposal/apply contract is bound to the anchor-profile content digest and rejects
stale or concurrent edits. It is not registered as an agent tool or active job path. If
added later, Admin's Integrations section must show the full proposal and require a
separate Anchor confirmation. The deterministic import path never invokes this semantic pass.

## Phase 4A — Direct OAuth consent for self-hosted brains (implemented)

`LinkedInOAuthClient` implements LinkedIn's documented authorization URL and server-side
authorization-code exchange with the least-privilege
`r_dma_portability_3rd_party` scope. It validates token responses and bounds provider
errors. The importer accepts a dynamic `LinkedInAccessTokenProvider`, resolves it for each
API request, and can fall back to the existing static token during migration.

The service plugin contributes a thin browser/API boundary rather than a separate
`InterfacePlugin`: private status JSON, POST-only connect/disconnect actions, and a public
callback protected by random, process-local state that expires after ten minutes and can
be consumed only once. It renders no standalone management page. The callback stores the
exchanged credential, never exposes it to the browser, and returns to Admin's Integrations
section. Rover injects its auth-service operator-session resolver
and a `FileLinkedInOAuthTokenStore` under `data/linkedin-import`. The store uses atomic
local writes, a `0700` storage directory, a `0600` token file, strict persisted-shape
validation, explicit disconnect, and expiry-aware reads.

Direct mode is appropriate for self-hosted owners with their own approved LinkedIn
application and for a small pilot with a fixed callback allowlist. It requires explicit
instance plugin config with `oauth.mode: direct`, `clientId`, `clientSecret`, and a
`redirectUri` ending at `/linkedin/oauth/direct/callback`. Secret names remain
instance-owned through normal `brain.yaml` environment interpolation. It is not the
managed rollout model because distributing the shared LinkedIn application secret and
registering every dynamic brain callback would not scale safely.

### `/admin` Integrations workflow (next)

Use the dedicated admin console from the auth workstream, not a plugin-owned page, CMS,
dashboard, or agent tools. Add Integrations as a sibling of People and render a LinkedIn
card/wizard there. The LinkedIn plugin remains the sole backend owner and exposes
browser-safe service routes; `auth-service` only resolves the current principal and enforces
Anchor access. After rebasing onto the auth workstream, replace the temporary boolean
operator-session resolver with role-aware session resolution and require `anchor` for every
status/connect/disconnect/preview/import action.

The deterministic import wizard is:

1. **Connected state** — show credential status/expiry and an `Inspect import` action.
2. **Preview** — fetch the registered Snapshot domains, compute the normal merge, and show
   current value, imported value, and outcome (`fill`, `append`, or `preserve owner value`)
   for every proposed field. Do not run AI.
3. **Review binding** — create a short-lived, single-use review ID bound server-side to the
   mapped patch digest and current anchor-profile baseline. Do not trust a browser-submitted
   patch or digest by itself.
4. **Confirm import** — an operator-authenticated POST consumes the review ID and queues the
   existing import job. The job refetches source/profile data and rejects stale review just
   as the existing handler already does.
5. **Result** — return to `/admin?section=integrations&provider=linkedin` with
   queued/completed/failed status and a concise list of applied versus preserved fields.
   Re-import follows the same preview and confirmation path.

Endpoint ownership and security follow the HTTP route-registry hardening plan already on
`main`: Admin is only the UI, each service owns its admin API, protocol callbacks remain
protocol routes, and the shared webserver remains the sole listener.

| Owner             | Method and path                       | Target route security                           |
| ----------------- | ------------------------------------- | ----------------------------------------------- |
| `linkedin-import` | `GET /linkedin/admin/status`          | `operator`, minimum `anchor`, CSRF not required |
| `linkedin-import` | `POST /linkedin/admin/connect`        | `operator`, minimum `anchor`, CSRF required     |
| `linkedin-import` | `POST /linkedin/admin/disconnect`     | `operator`, minimum `anchor`, CSRF required     |
| `linkedin-import` | `POST /linkedin/admin/preview`        | `operator`, minimum `anchor`, CSRF required     |
| `linkedin-import` | `POST /linkedin/admin/import`         | `operator`, minimum `anchor`, CSRF required     |
| `linkedin-import` | `GET /linkedin/oauth/broker/return`   | `protocol`                                      |
| `linkedin-import` | `GET /linkedin/oauth/direct/callback` | `protocol`; direct mode only                    |

Until the normalized route registry and tagged `security` contract land on this branch,
legacy `getWebRoutes()` declarations retain `public: true` and duplicate the intended
Anchor/same-origin checks inside handlers. After rebasing, migrate them to
`context.http.register()`, let the shared host enforce `operator` authorization and CSRF,
and retain handler checks only until the central authorization matrix is proven. Callback
and broker-return handlers stay `protocol`: they validate expiring single-use state/grants
rather than requiring an Admin session.

Admin POST bodies use browser-safe exported action constants and action-matching
`confirmation` values, following `/auth/admin/mutations`; disconnect and import also
require explicit UI review. Responses containing profile data use
`Cache-Control: no-store`, and neither access tokens nor raw provider responses reach the
browser. Backend routes are not separately advertised as console endpoints; only the
Admin surface is advertised.

## Phase 4B — Managed OAuth callback broker (in progress)

Deploy one central `oauth-broker` `ServicePlugin`, for example at `connect.rizom.ai`, on
the normal shared webserver. Register exactly one LinkedIn callback:
`https://connect.rizom.ai/oauth-broker/callback/linkedin`. Managed Rover instances do not
receive the LinkedIn application secret. Each receives only a revocable, instance-scoped
broker credential and keeps the reusable LinkedIn member token after redemption.

The broker mechanics are provider-neutral. Its exact first-provider route table is:

| Method and path                       | Target route security                                  |
| ------------------------------------- | ------------------------------------------------------ |
| `POST /oauth-broker/authorizations`   | `protocol`; instance authentication                    |
| `GET /oauth-broker/callback/linkedin` | `protocol`; provider state validation                  |
| `POST /oauth-broker/grants/redeem`    | `protocol`; instance authentication and one-time grant |

The first broker slice is implemented in `plugins/oauth-broker`. It uses exact legacy web
route declarations on the shared host, a provider-adapter contract, a static registry of
revocable per-instance HTTP Basic credentials for HTTPS server-to-server calls, exact
configured return URIs, hashed in-memory lookup keys, bounded ten-minute authorization
state, and bounded two-minute credential grants. State and grants are deliberately
process-local: restart invalidates only an in-flight connection, which the user can retry.
The broker never stores reusable provider credentials after grant redemption. The
LinkedIn adapter and owner-side `LinkedInBrokerClient` are also implemented: the adapter
owns portability scope and token validation, while the brain consumes local state,
redeems the bound grant server-to-server, validates the canonical credential again, and
stores it through `LinkedInOAuthTokenStore`.

The broker must:

- register and authenticate brain instances;
- allowlist each instance's exact return URI rather than accepting a browser-supplied URI;
- create expiring authorization state bound to provider, instance, and return URI;
- route a fixed provider callback back to the initiating brain;
- hold an exchanged credential behind a random, short-lived, single-use grant;
- redeem that grant only over an authenticated server-to-server request from the bound
  instance; and
- prevent replay, avoid credential logging, and retain only bounded audit metadata.

Provider adapters remain explicit. The LinkedIn adapter owns its authorization/token URLs,
`r_dma_portability_3rd_party` scope, request parameters, token schema, bounded errors, and
any future refresh or revocation behavior. The generic broker core treats provider
credentials as opaque and must not infer refresh support, scope syntax, or token fields.

Managed connection sequence:

1. The Anchor POSTs `/linkedin/admin/connect` on their own brain.
2. The LinkedIn import plugin creates local single-use state and calls
   `POST /oauth-broker/authorizations` with `provider: "linkedin"` for its registered
   instance.
3. The broker authenticates the brain, resolves its exact allowlisted
   `/linkedin/oauth/broker/return` URI, stores broker state, and returns LinkedIn's
   authorization URL.
4. LinkedIn redirects only to `GET /oauth-broker/callback/linkedin` on the central host.
   The LinkedIn adapter validates and exchanges the provider code server-side.
5. The broker creates a short-lived opaque grant, then redirects the browser to the bound
   brain return route with the grant and the brain's original state—never the access
   token.
6. The brain consumes its local state and redeems the grant through authenticated
   `POST /oauth-broker/grants/redeem` using its instance credential. The broker atomically
   consumes the grant and returns the provider-specific credential once.
7. The brain validates and stores the LinkedIn credential through
   `LinkedInOAuthTokenStore`; imports continue to call LinkedIn directly from that brain.

Package boundaries:

- `plugins/oauth-broker` — generic central `ServicePlugin`, Zod broker protocol, instance
  registry, state/grant stores, provider-adapter contract, and fixed callback routes;
- the dedicated Admin console — Integrations navigation and the LinkedIn management UI;
- `plugins/linkedin-import` — browser-safe admin API, implemented `LinkedInBrokerClient`,
  LinkedIn provider adapter and credential validation, local token storage,
  direct/self-hosted mode, and profile import; and
- the first LinkedIn broker adapter may be composed with `oauth-broker` from the central
  brain model. Do not split provider adapters into a new package until a second upstream
  OAuth provider proves the boundary.

Implemented broker tests cover cross-instance substitution, arbitrary return-URI
rejection, expired/replayed state and grants, failed redemption authentication, provider
denial, concurrent redemption, LinkedIn adapter scope/credential validation, local return
state, and confirmation that no provider credential appears in browser redirects or
status responses. Remaining integration tests must cover end-to-end log redaction, rate
limits, and central deployment.

## Phase 4C — Refresh and Changelog synchronization (blocked)

1. Confirm refresh-token availability for `r_dma_portability_3rd_party` in the approved
   LinkedIn application before implementing refresh. LinkedIn's public authorization-code
   contract does not currently document refresh fields, so direct mode and the provider
   adapter deliberately ignore them rather than guessing a refresh contract.
2. Keep refresh and revocation provider-specific even when authorization is brokered.
3. Use refresh, if sanctioned, to support scheduled Changelog pulls within LinkedIn's
   28-day window.

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
- **Single owner token per brain** — each user runs their own brain; the managed broker is
  multi-instance routing infrastructure, not durable multi-tenant token storage.
- **Generic broker transport, specific provider semantics** — instance authentication,
  state correlation, callback routing, and one-time grants are reusable; LinkedIn scopes,
  token exchange/validation, refresh, revocation, and imported data remain explicit.
- **Two OAuth deployment modes** — direct mode supports self-hosted applications and small
  fixed pilots; managed mode centralizes the shared application secret and callback without
  centralizing the reusable owner token.
- **Instance-owned plugin configuration** — Rover injects runtime services but does not
  know plugin environment-variable names. OAuth mode and connection settings live under
  `plugins.linkedin-import` in `brain.yaml`; each instance chooses secret names through
  normal environment interpolation, matching the external-plugin configuration model.
- **Deterministic first, LLM second** — structured record is deterministic; only narrative
  fields use an LLM, as a separate optional pass.
- **DMA API primary (EEA), export-ZIP fallback (rest)** — sanctioned and stable beats
  scraping; both feed one pipeline behind a pluggable-source seam.

## Risks / constraints

- **EEA-only** DMA access — non-EEA owners are export-only until (unless) LinkedIn widens
  portability.
- **Developer-approval gate** — one-time but not instant; start the application early since
  it blocks phases 2–4.
- **Broker trust boundary** — the managed broker holds the shared LinkedIn client secret and
  transient exchanged credentials. Exact return-URI registration, per-instance revocation,
  short grant TTLs, atomic consumption, log redaction, rate limits, and operational audit
  are launch requirements.
- **Broker availability** — managed users cannot establish or renew a connection while the
  broker is unavailable, although an unexpired token already stored in their brain remains
  usable.
- **28-day Changelog window** — continuous sync must run inside it with a valid (refreshed)
  token.
- **Write-path/cache** — extension-field write + singleton cache invalidation must be
  verified (see Architecture).
- **Preference migration** — legacy profile `audience`/`desiredTone` data remains in place
  after the idempotent copy into brain-character communication preferences; automatic
  source deletion would risk losing user intent.

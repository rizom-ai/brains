# Plan: LinkedIn Import

## Status

Proposed. Nothing is on `main`:

- `anchor-profile` has no professional history fields. `professionalProfileFields` in `plugins/profile/src/schemas.ts` holds `role`, `expertise`, `currentFocus` and `availability`; no schema anywhere has `headline`, `industry`, `location`, `skills`, `positions`, `education` or `certifications`.
- No plugin calls a LinkedIn read API. `entities/social-media` posts to LinkedIn with a static `LINKEDIN_ACCESS_TOKEN` and the `w_member_social` scopes only.
- No plugin runs an outbound OAuth client flow. `shell/auth-service` is an OAuth server; atproto uses an app password.
- `docs/feature-overview.md` lists LinkedIn import and an OAuth broker as opt-in additions, but neither is in the capability catalog (`packages/brain-cli/src/model/canonical-brain.ts`).

`work/professional-profile-v2` (last commit 2026-07-19) holds an earlier implementation built on the retired `brains/rover` package and the deleted `plugins/rover-onboarding`. It is reference material: the snapshot client, PROFILE mapper, merge, fingerprints, OAuth client, state store and broker are ported phase by phase below; wiring is rebuilt against the current plugin, Studio and auth contracts. Delete the branch when Phase 10 has landed.

## Context

LinkedIn's public API gives only basic identity (OpenID Connect `profile`/`email` → `/v2/userinfo`). Work history, skills and education are not available through it, and third-party scrapers are legally unstable and violate LinkedIn's terms.

The sanctioned path is the **DMA Member Data Portability (3rd Party) API**, which LinkedIn built under EU Digital Markets Act Article 6(9):

- A member consents through three-legged OAuth with scope `r_dma_portability_3rd_party`, and the app reads their data.
- **EEA members only.** LinkedIn refuses non-EEA members at the consent step. Everyone else can download their data export (GDPR Art. 20) and upload it.
- Member Snapshot API: point-in-time data per domain. Member Changelog API: events within a 28-day window.
- Access needs a one-time developer-app approval: a Company Page association and business verification.

Snapshot shape:

```
GET https://api.linkedin.com/rest/memberSnapshotData?q=criteria[&domain=PROFILE]
Headers: Authorization: Bearer <token>   Linkedin-Version: 202312
→ { elements: [ { snapshotDomain: "PROFILE", snapshotData: [ { "First Name": "…",
    "Last Name": "…", "Headline": "…", "Summary": "…", "Industry": "…",
    "Geo Location": "…", "Websites": "…" } ] } ], paging: {…} }
```

Keys are title-case strings with spaces. Responses are paginated until "No data found for this memberId". Other domains include `POSITIONS`, `EDUCATION`, `SKILLS` and `CERTIFICATIONS`; their exact keys are not documented and must be captured (Phase 4) before they are mapped.

## Goal

The Anchor connects their LinkedIn account once from Studio, reviews a field-by-field preview, and confirms. Their headline, industry, location, skills, positions, education and certifications land in `anchor-profile`, where the professional site renders them. Re-importing fills gaps and appends new records; it never overwrites what the owner wrote. Owners outside the EEA upload their LinkedIn data export into the same pipeline.

## Non-goals

- **Connections or other members' data.** The owner's profile only.
- **Scraper integration.**
- **A generic data connector.** Mapping stays LinkedIn-specific. Only the broker's callback and grant mechanics are provider-neutral.
- **AI-written profile text.** The import is deterministic. Owners who want a tagline or intro drafted from their imported history ask the agent, which already edits `anchor-profile`.
- **Chat and MCP tools.** Connecting an account and importing are Anchor management actions in Studio.
- **Changelog sync.** It needs refresh tokens, and LinkedIn documents none for `r_dma_portability_3rd_party`. Re-importing from Studio covers updates.
- **Tone and audience.** Tone lives in the style guide and `audience` on the profile's common extension; the import reads and writes neither.
- **Central token custody.** Each brain stores its own token. The managed broker holds an exchanged credential only behind a short-lived, single-use grant.

## Decisions

- **Target `anchor-profile`.** It is the owner's identity, already read by the site, the agent and brain instructions. New fields join `professionalProfileFields` in `plugins/profile`, registered through `extendFrontmatterSchema` like the existing ones. Field names are provider-neutral; the mapper translates LinkedIn keys.
- **`skills` stays separate from `expertise`.** Expertise is the owner's curated claim; imported skills are broader. The homepage keeps showing expertise and falls back to skills only when expertise is empty.
- **One opt-in plugin, `linkedin-import`.** A `ServicePlugin` owning the client, mapping, merge, credential, Studio workspace and OAuth routes. It joins the catalog without a bundle, so instances select it with `add: [linkedin-import]`. It is inert without a credential.
- **Writes go through the entity service.** The import job renders the full `anchor-profile` markdown and calls `updateEntity` with `expectedContentHash` from the previewed profile. A changed profile fails the write instead of being overwritten. `subscribeToIdentityRefresh` already refreshes the profile cache on `entity:updated`.
- **Merge is fill-and-append.** A scalar field is written only when absent or still the starter placeholder that `plugins/profile/src/starter-identity.ts` seeds (the name `Anchor for <starter name>` and its placeholder story). A list record is appended only when its fingerprint is new; a record matching an owner-written one is left as written. Re-running unchanged data writes nothing.
- **The surface is a Studio workspace.** `linkedin-import:linkedin` with permission floor `admin`, and an `accessHandler` that also requires `isAnchor` (Admin does not imply Anchor). The view shows connection status and the preview; Import is a `defineWorkspaceAction` with a prepared confirmation bound to the caller, the preview digest and the profile's content hash, with expiry and single use. The old branch's review store is not ported; prepared confirmation replaces it.
- **OAuth routes are plugin web routes.** Studio cannot carry author URLs into a form post, so the view links to the plugin's own start route. Routes use `getWebRoutes()` with `public: true` and authenticate inside the handler (`context.auth.get()?.resolveSession`, requiring `admin` and `isAnchor`), as Studio and auth admin do today. They move to the operator security kind when `http-route-registry-hardening.md` Phase 2 lands.
- **The token lives in the Anchor's account settings.** It is encrypted with `ACCOUNT_SETTINGS_ENCRYPTION_KEY`, scoped to the account, and removed when the account is deleted. `defineAccountSettings` today only stores values a person submits through the Account form, so Phase 3 adds an owner-scoped write for a plugin's own definition.
- **Two OAuth modes.** Direct mode (Phase 3) uses the instance's own approved LinkedIn app; it suits self-hosting and a small pilot. Managed mode (Phase 9) routes consent through a central broker so instances never hold the shared app secret.

## Precondition

Apply for the Member Data Portability (3rd Party) product on a Rizom LinkedIn developer app: associate the Rizom Company Page, complete business verification, and register the direct-mode redirect URI of the pilot brain. Approval is not instant and blocks live testing from Phase 2 and fixture capture in Phase 4. Phases 1–3 are built and tested against the documented PROFILE fixture.

## Phases

Each phase is a commit, tests first. Phases share a PR until the next one needs the earlier work running on a brain:

- **Phases 1–4, one PR.** Shape capture runs on a deployed brain with the approved LinkedIn app.
- **Phases 5–8, one PR**, once the Phase 4 fixtures are committed.
- **Phase 9 and Phase 10, one PR each.** The broker needs only Phase 3; the export upload needs the Phase 5–8 mappers.

### Phase 1 — Headline, industry and location on the professional profile

Owners can set these by hand before any import exists.

- `plugins/profile/src/schemas.ts`: add optional `headline`, `industry` and `location` to `professionalProfileFields`, with null defaults in `professionalProfileViewSchema`.
- `sites/professional/src/templates/about.tsx`: headline under the name; location and industry in the facts list.
- `sites/professional/src/templates/homepage-list.tsx`: headline as the fallback for `tagline` before `description`.
- Tests: profile schema accepts and rejects the new fields; both templates render them and render unchanged without them.

### Phase 2 — Import PROFILE with a static token (walking skeleton)

End to end: a token in `brain.yaml`, a Studio preview, a confirmed import into `anchor-profile`.

- `plugins/linkedin-import`: config `{ accessToken? }`; no workspace or job without it.
- Port `linkedin-client.ts` (bearer auth, fixed `Linkedin-Version: 202312`, Zod-validated pages, bounded error bodies), `snapshot-schema.ts`, the PROFILE fixture and `transform/profile-mapper.ts` (`name`, `headline`, `industry`, `location`, `website`, `story`).
- Port the PROFILE part of `merge-profile.ts` and `profile-import-digest.ts`. Add the `import-profile` job: refetch the snapshot and profile, recompute the digest, reject a stale confirmation, write with `expectedContentHash`.
- The workspace (see Decisions) with the field preview showing current value, imported value and outcome (`fill`, `preserve` or `unchanged`), and the Import action.
- Catalog: `linkedin-import` capability in `canonical-brain.ts`, in no bundle; `LINKEDIN_PORTABILITY_TOKEN` in `canonicalEnvSchema`; a `plugins.linkedin-import` entry in `packages/brain-cli/docs/brain-yaml-reference.md`.
- Tests: client headers, pagination and errors; mapper; merge preserves owner values and is idempotent; job rejects a changed profile and a stale digest; workspace denied to an Admin who is not the Anchor; plugin inert without a token.

### Phase 3 — Connect LinkedIn from Studio (direct mode)

Replaces the static token; `accessToken` config and `LINKEDIN_PORTABILITY_TOKEN` are removed.

- `shell/plugins`: an owner-scoped account-settings write, so a plugin can store and delete values of its own `defineAccountSettings` definition for a given account. Tests: a plugin cannot write another definition; secret values stay encrypted and redacted in forms.
- Port `linkedin-oauth-client.ts` (authorization URL, server-side code exchange, `r_dma_portability_3rd_party`, validated token response) and `linkedin-oauth-state-store.ts` (process-local, ten-minute, single-use state).
- Routes: `GET /linkedin/oauth/start` (Anchor session, same-origin, creates state, redirects to LinkedIn) and `GET /linkedin/oauth/callback` (validates and consumes state, exchanges the code, stores the token in the Anchor's account settings, returns to the workspace). The token never reaches the browser.
- Config: `oauth: { clientId, clientSecret, redirectUri }`, secrets through `${…}` interpolation.
- Workspace: connection status and expiry, a Connect link, and a Disconnect action with static confirmation. Import reads the stored token.
- Tests: state expiry, replay and cross-session use rejected; denied consent returns to the workspace with an error; expired token shows as disconnected; no token in redirects, view data or logs.

### Phase 4 — Capture rich-domain shapes

- Port the schema summarizer as an Anchor-only workspace action, "Inspect LinkedIn data shapes". It reports source field names, value types, occurrence and record counts, and redacted record shapes, never member values.
- Run it against consenting EEA accounts and commit redacted fixtures for `SKILLS`, `POSITIONS`, `EDUCATION` and `CERTIFICATIONS`.
- Tests: no member value appears in the summary for a fixture seeded with sentinel values.

### Phases 5–8 — One domain each: skills, positions, education, certifications

Each phase adds one field and its source, in this order: `skills: string[]`; `positions: { companyName, title, description?, employmentType?, location?, startedOn?, finishedOn? }[]`; `education: { schoolName, degreeName?, fieldOfStudy?, startedOn?, finishedOn?, notes? }[]`; `certifications: { name, issuingOrganization?, issuedOn?, expiresOn?, credentialId?, credentialUrl? }[]`. Nested keys and date formats are settled from the Phase 4 fixtures before the schema is merged.

- `plugins/profile`: the field in `professionalProfileFields` and the view schema.
- `linkedin-import`: the domain's mapper in the transform registry (the registry is the single enablement point; preview and import fetch every registered domain) and its fingerprint from `professional-fingerprints.ts`. The preview gains `append` and `append-and-preserve` outcomes in Phase 5.
- `sites/professional`: Skills apart from Expertise on the about page, with the homepage fallback (Phase 5); a dated Experience, Education or Certifications section on the about page (Phases 6–8).
- Tests: mapper against the captured fixture; fingerprint matching preserves owner-written records and appends new ones; the template renders and omits the section.

### Phase 9 — Managed connection through a central broker

- `plugins/oauth-broker`: port the provider-neutral broker as a `ServicePlugin` for one central brain (for example `connect.rizom.ai`): per-instance HTTP Basic credentials, exact configured return URIs, hashed lookup keys, ten-minute authorization state, two-minute single-use grants, all process-local. Routes: `POST /oauth-broker/authorizations`, `GET /oauth-broker/callback/linkedin` and `POST /oauth-broker/grants/redeem`, authenticated inside the handler.
- The LinkedIn provider adapter (scope, token URL, token validation) is composed into the broker from `linkedin-import`; the broker core treats credentials as opaque.
- `linkedin-import`: `oauth.mode: broker` with the broker URL and instance credential; port `linkedin-broker-client.ts` and add `GET /linkedin/oauth/broker/return`, which consumes local state, redeems the grant server to server, validates the credential and stores it as in Phase 3.
- The broker is catalog-only, never in a bundle; it runs on the central brain alone.
- Tests: cross-instance substitution, arbitrary return URIs, expired or replayed state and grants, failed instance authentication, concurrent redemption, and no credential in any redirect or log line.

### Phase 10 — Import from the LinkedIn data export (non-EEA)

- Declarative workspaces have no file input. Add one to the operator view contract and the Studio renderer, with the 10 MB cap Studio uploads already use, delivering the file to the action handler.
- `linkedin-import`: an Upload export action; unzip with `fflate` (already a dependency), parse the export's CSVs, and feed the same mappers through an export source adapter. The file is held in `context.uploads.scoped` only until the import completes or the preview expires.
- The preview, confirmation and job are the Phase 2 ones.
- Tests: a redacted export fixture maps to the same profile as the matching snapshot fixture; oversize and non-ZIP files are rejected; the upload is removed after import.

## Risks

- **EEA-only API.** Non-EEA owners wait for Phase 10.
- **Developer approval** can take weeks and is outside our control; Phases 1–3 do not wait for it.
- **Broker trust.** The central brain holds the shared app secret and transient credentials. Exact return URIs, per-instance revocation, short grants, atomic redemption, log redaction and rate limits are launch requirements for Phase 9.
- **Broker availability.** Managed owners cannot connect while the broker is down; a stored token keeps working.
- **Token expiry.** Without refresh, the owner reconnects when the token expires; the workspace shows the expiry date.

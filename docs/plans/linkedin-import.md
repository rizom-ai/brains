# Plan: LinkedIn Import

## Status

In progress. On `main`:

- Professional profiles take `headline`, `industry` and `location`. The professional site's about page sets the headline under the name and lists industry and location; the editorial homepage falls back to the headline before the description.
- The opt-in `linkedin-import` plugin ([README](../../plugins/linkedin-import/README.md)). The Anchor connects LinkedIn from a Studio workspace through direct-mode OAuth against the instance's own LinkedIn app; the token stays in the Anchor's account settings. A confirmed import fills `name`, `headline`, `industry`, `location`, `website` and the story from the PROFILE snapshot without overwriting what the owner wrote.
- An Anchor-only **Inspect LinkedIn data shapes** action returns a redacted shape summary of the four rich domains.
- The opt-in `oauth-broker` plugin ([README](../../plugins/oauth-broker/README.md)) for one central brain, and `linkedin-import`'s `broker` mode. An instance without its own LinkedIn app starts consent at the broker, LinkedIn returns to the broker's single callback, and the instance redeems a two-minute, single-use grant for the token. The protocol is in `@brains/contracts`.

Next: once LinkedIn approves the app (see Precondition), capture the rich-domain fixtures (Phase 4), then Phases 5–8.

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
- **Writes go through the entity service.** The confirmed Import action renders the full `anchor-profile` markdown and calls `updateEntity` with `expectedContentHash` from the profile it read. It runs in the request, not as a queued job, so the owner sees the result in the same Studio flow. A changed profile fails the write instead of being overwritten. `subscribeToIdentityRefresh` already refreshes the profile cache on `entity:updated`.
- **Merge is fill-and-append.** A scalar field is written only when absent or still a placeholder: the recipe seed's (`Your Name Here`, `https://example.com`, "This is where your story goes.") or the starter profile's from `plugins/profile/src/starter-identity.ts` (`Anchor for <starter name>` and its placeholder story). A list record is appended only when its fingerprint is new; a record matching an owner-written one is left as written. Re-running unchanged data writes nothing.
- **The surface is a Studio workspace.** `linkedin-import:linkedin` with permission floor `admin`, and an `accessHandler` that also requires `isAnchor` (Admin does not imply Anchor). The view shows connection status and the preview; Import is a `defineWorkspaceAction` with a prepared confirmation bound to the caller, the preview digest and the profile's content hash, with expiry and single use. The old branch's review store is not ported; prepared confirmation replaces it.
- **OAuth routes are plugin web routes.** Studio cannot carry author URLs into a form post, so the view links to the plugin's own start route. Routes use `getWebRoutes()` with `public: true` and authenticate inside the handler (`context.auth.get()?.resolveSession`, requiring `admin` and `isAnchor`), as Studio and auth admin do today. They move to the operator security kind when `http-route-registry-hardening.md` Phase 2 lands.
- **The token lives in the Anchor's account settings.** It is encrypted with `ACCOUNT_SETTINGS_ENCRYPTION_KEY`, scoped to the account, and removed when the account is deleted. The plugin registers its own `defineAccountSettings` definition through `context.accountSettings` and saves, reads and deletes one account's values with the registry's `save`, `getForActor` and `delete`. The setting appears in the Account form as **LinkedIn**, where the token can also be pasted by hand.
- **Two OAuth modes.** Direct mode (shipped) uses the instance's own approved LinkedIn app; it suits self-hosting and a small pilot. Managed mode (shipped) routes consent through a central broker so instances never hold the shared app secret.

## Precondition

Apply for the Member Data Portability (3rd Party) product on a Rizom LinkedIn developer app: associate the Rizom Company Page, complete business verification, and register the direct-mode redirect URI of the pilot brain. Approval is not instant and blocks live use of the import and the Phase 4 capture.

## Phases

Each phase is a commit, tests first. Phases 5–8 share one PR once the Phase 4 fixtures are committed. Phase 10 is one PR; it needs the Phase 5–8 mappers.

### Phase 4 — Commit rich-domain fixtures

- On a brain with the approved app, the Anchor runs **Inspect LinkedIn data shapes** for consenting EEA accounts.
- Commit the redacted summaries as fixtures for `SKILLS`, `POSITIONS`, `EDUCATION` and `CERTIFICATIONS` under `plugins/linkedin-import/test/fixtures/`. They settle the nested keys and date formats Phases 5–8 depend on.

### Phases 5–8 — One domain each: skills, positions, education, certifications

Each phase adds one field and its source, in this order: `skills: string[]`; `positions: { companyName, title, description?, employmentType?, location?, startedOn?, finishedOn? }[]`; `education: { schoolName, degreeName?, fieldOfStudy?, startedOn?, finishedOn?, notes? }[]`; `certifications: { name, issuingOrganization?, issuedOn?, expiresOn?, credentialId?, credentialUrl? }[]`. Nested keys and date formats are settled from the Phase 4 fixtures before the schema is merged.

- `plugins/profile`: the field in `professionalProfileFields` and the view schema.
- `linkedin-import`: the domain's mapper in the transform registry (the registry is the single enablement point; preview and import fetch every registered domain) and its fingerprint from `professional-fingerprints.ts`. The preview gains `append` and `append-and-preserve` outcomes in Phase 5.
- `sites/professional`: Skills apart from Expertise on the about page, with the homepage fallback (Phase 5); a dated Experience, Education or Certifications section on the about page (Phases 6–8).
- Tests: mapper against the captured fixture; fingerprint matching preserves owner-written records and appends new ones; the template renders and omits the section.

### Phase 10 — Import from the LinkedIn data export (non-EEA)

- Declarative workspaces have no file input. Add one to the operator view contract and the Studio renderer, with the 10 MB cap Studio uploads already use, delivering the file to the action handler.
- `linkedin-import`: an Upload export action; unzip with `fflate` (already a dependency), parse the export's CSVs, and feed the same mappers through an export source adapter. The file is held in `context.uploads.scoped` only until the import completes or the preview expires.
- The preview, confirmation and write are the shipped PROFILE import's.
- Tests: a redacted export fixture maps to the same profile as the matching snapshot fixture; oversize and non-ZIP files are rejected; the upload is removed after import.

## Risks

- **EEA-only API.** Non-EEA owners wait for Phase 10.
- **Developer approval** can take weeks and is outside our control; until LinkedIn approves the app, connecting and importing fail at LinkedIn.
- **Broker trust.** The central brain holds the shared app secret and, for up to two minutes, exchanged credentials; compromising it exposes both. It runs as a dedicated brain with no other users. Return addresses are exact per instance, removing an instance revokes it, and each instance may start ten connections per ten minutes.
- **Broker availability.** Managed owners cannot connect while the broker is down; a stored token keeps working.
- **Token expiry.** Without refresh, the owner reconnects when the token expires; the workspace shows the expiry date.

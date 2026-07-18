# @brains/linkedin-import

Imports the anchor owner's professional profile through LinkedIn's sanctioned DMA Member Data Portability API.

The plugin is inert unless a static `accessToken` or dynamic token provider is configured. It does not register agent tools or render a standalone management page. LinkedIn connection and import are an Anchor-owned workflow for the dedicated `/admin` console's Integrations section. Deterministic field-level preview and confirmation remain the next admin-console increment.

`LinkedInOAuthClient` implements LinkedIn's documented server-side authorization-code protocol with the least-privilege `r_dma_portability_3rd_party` scope. Thin service-plugin routes provide `/linkedin/admin/*` JSON endpoints for the admin SPA. Direct/self-hosted mode exposes `/linkedin/oauth/direct/callback`, protected by random, expiring, single-use state. Managed mode will instead use the central `/oauth-broker/callback/linkedin` and a local broker-return route. Access tokens are never returned to the browser.

The importer resolves `LinkedInAccessTokenProvider` on each API request, allowing token rotation with a static-token fallback during migration. `LinkedInOAuthTokenStore` defines the interface-to-secret-store handoff and status contract. Rover injects `FileLinkedInOAuthTokenStore`, which uses atomic writes, expiry checks, a `0700` directory, and a `0600` token file under `data/linkedin-import`, following the auth-service local persistence pattern. Refresh remains intentionally unsupported until LinkedIn confirms a refresh contract for the approved portability application.

The optional narrative-distillation backend can propose bounded `tagline`, `intro`, and `story` copy from the current professional profile. It is dormant: it is neither an agent tool nor an active panel/job path. If exposed later, the panel must show the full proposal for separate confirmation and reject stale profile baselines.

The current walking skeleton imports LinkedIn's documented `PROFILE` snapshot domain. The schema summarizer can inspect `POSITIONS`, `EDUCATION`, `SKILLS`, and `CERTIFICATIONS`, returning only field names, value types, occurrence counts, and deduplicated redacted record shapes—never member values or nested object keys. It has no agent-facing surface. Provider-neutral stable fingerprints and append-only merging are ready for these rich records, but their mappers remain disabled until representative sanctioned API/export fixtures confirm the source contracts. The transform registry is the single enablement point: preview and execution automatically fetch every registered domain, while unregistered domains remain inspection-only.

Rover enables explicit direct/self-hosted mode when all three settings are present:

```dotenv
LINKEDIN_DIRECT_CLIENT_ID=...
LINKEDIN_DIRECT_CLIENT_SECRET=...
LINKEDIN_DIRECT_REDIRECT_URI=https://brain.example/linkedin/oauth/direct/callback
```

`LINKEDIN_ACCESS_TOKEN` remains an optional static fallback during migration.

The API requires the `r_dma_portability_3rd_party` scope and is available only for consenting EEA members. Non-EEA export-ZIP support is planned separately.

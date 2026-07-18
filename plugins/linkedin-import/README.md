# @brains/linkedin-import

Imports the anchor owner's professional profile through LinkedIn's sanctioned DMA Member Data Portability API.

The plugin is inert unless a static `accessToken` or dynamic token provider is configured. It does not register agent tools. LinkedIn connection and import are an operator-owned administrative workflow on the plugin's `/linkedin` integration page, surfaced through the existing dashboard navigation rather than CMS. The current page handles connection lifecycle; deterministic field-level preview and confirmation are the next panel increment.

`LinkedInOAuthClient` implements LinkedIn's documented server-side authorization-code protocol with the least-privilege `r_dma_portability_3rd_party` scope. Thin service-plugin routes provide an operator-only status page plus POST-only connect/disconnect actions at `/linkedin`; the public `/linkedin/callback` is protected by random, expiring, single-use server-side state. Access tokens are never returned to the browser.

The importer resolves `LinkedInAccessTokenProvider` on each API request, allowing token rotation with a static-token fallback during migration. `LinkedInOAuthTokenStore` defines the interface-to-secret-store handoff and status contract. Rover injects `FileLinkedInOAuthTokenStore`, which uses atomic writes, expiry checks, a `0700` directory, and a `0600` token file under `data/linkedin-import`, following the auth-service local persistence pattern. Refresh remains intentionally unsupported until LinkedIn confirms a refresh contract for the approved portability application.

The optional narrative-distillation backend can propose bounded `tagline`, `intro`, and `story` copy from the current professional profile. It is dormant: it is neither an agent tool nor an active panel/job path. If exposed later, the panel must show the full proposal for separate confirmation and reject stale profile baselines.

The current walking skeleton imports LinkedIn's documented `PROFILE` snapshot domain. The schema summarizer can inspect `POSITIONS`, `EDUCATION`, `SKILLS`, and `CERTIFICATIONS`, returning only field names, value types, occurrence counts, and deduplicated redacted record shapes—never member values or nested object keys. It has no agent-facing surface. Provider-neutral stable fingerprints and append-only merging are ready for these rich records, but their mappers remain disabled until representative sanctioned API/export fixtures confirm the source contracts. The transform registry is the single enablement point: preview and execution automatically fetch every registered domain, while unregistered domains remain inspection-only.

Rover enables the browser flow when all three OAuth settings are present:

```dotenv
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
LINKEDIN_REDIRECT_URI=https://brain.example/linkedin/callback
```

`LINKEDIN_ACCESS_TOKEN` remains an optional static fallback during migration.

The API requires the `r_dma_portability_3rd_party` scope and is available only for consenting EEA members. Non-EEA export-ZIP support is planned separately.

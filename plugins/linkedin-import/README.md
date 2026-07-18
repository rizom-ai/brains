# @brains/linkedin-import

Imports the anchor owner's professional profile through LinkedIn's sanctioned DMA Member Data Portability API.

The plugin is inert unless a static `accessToken` or dynamic token provider is configured. Its anchor-only `linkedin-import_import` tool fetches a read-only preview and enters the host's typed confirmation flow before queuing a deterministic import job. Confirmation is bound to a digest of the exact previewed patch and anchor-profile baseline; the job refetches both and refuses to write if either changed. The job fills absent `anchor-profile` fields and preserves owner-authored values.

`LinkedInOAuthClient` implements LinkedIn's documented server-side authorization-code protocol with the least-privilege `r_dma_portability_3rd_party` scope. Thin service-plugin routes provide an operator-only status page plus POST-only connect/disconnect actions at `/linkedin`; the public `/linkedin/callback` is protected by random, expiring, single-use server-side state. Access tokens are never returned to the browser.

The importer resolves `LinkedInAccessTokenProvider` on each API request, allowing token rotation with a static-token fallback during migration. `LinkedInOAuthTokenStore` defines the interface-to-secret-store handoff and status contract. Rover injects `FileLinkedInOAuthTokenStore`, which uses atomic writes, expiry checks, a `0700` directory, and a `0600` token file under `data/linkedin-import`, following the auth-service local persistence pattern. Refresh remains intentionally unsupported until LinkedIn confirms a refresh contract for the approved portability application.

The optional anchor-only `linkedin-import_distill_profile` tool separately proposes bounded `tagline`, `intro`, and `story` copy from the current professional profile. It never runs during deterministic import, excludes `headline` from its output contract, shows the full proposal for typed confirmation, and rejects stale profile baselines before applying the reviewed values.

The current walking skeleton imports LinkedIn's documented `PROFILE` snapshot domain. The anchor-only `linkedin-import_inspect_schema` tool can inspect `POSITIONS`, `EDUCATION`, `SKILLS`, and `CERTIFICATIONS` individually, or all four in one report with `domain: "ALL_RICH"`, returning only field names, value types, occurrence counts, and deduplicated redacted record shapes—never member values or nested object keys. Provider-neutral stable fingerprints and append-only merging are ready for these rich records, but their mappers remain disabled until representative sanctioned API/export fixtures confirm the source contracts. The transform registry is the single enablement point: preview and execution automatically fetch every registered domain, while unregistered domains remain inspection-only.

Rover enables the browser flow when all three OAuth settings are present:

```dotenv
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
LINKEDIN_REDIRECT_URI=https://brain.example/linkedin/callback
```

`LINKEDIN_ACCESS_TOKEN` remains an optional static fallback during migration.

The API requires the `r_dma_portability_3rd_party` scope and is available only for consenting EEA members. Non-EEA export-ZIP support is planned separately.

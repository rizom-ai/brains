# @brains/linkedin-import

Imports the anchor owner's professional profile through LinkedIn's sanctioned DMA Member Data Portability API.

The plugin is inert unless a static `accessToken` or dynamic token provider is configured. It does not register agent tools or render a standalone management page. LinkedIn connection and import are an Anchor-owned workflow for the dedicated `/admin` console's future Integrations section. The headless backend already provides deterministic field-level preview and reviewed import routes.

`LinkedInOAuthClient` implements LinkedIn's documented server-side authorization-code protocol with the least-privilege `r_dma_portability_3rd_party` scope. Thin service-plugin routes provide `/linkedin/admin/*` JSON endpoints for a later Admin SPA. `POST /linkedin/admin/preview` issues a short-lived, session-bound review ID; `POST /linkedin/admin/import` consumes it once and queues the existing stale-digest-protected job. Direct/self-hosted mode exposes `/linkedin/oauth/direct/callback`. Managed mode uses the central `/oauth-broker/callback/linkedin` and local `/linkedin/oauth/broker/return` routes. Both use random, expiring, single-use local state, and access tokens are never returned to the browser.

The importer resolves `LinkedInAccessTokenProvider` on each API request, allowing token rotation with a static-token fallback during migration. `LinkedInOAuthTokenStore` defines the interface-to-secret-store handoff and status contract. Rover injects `FileLinkedInOAuthTokenStore`, which uses atomic writes, expiry checks, a `0700` directory, and a `0600` token file under `data/linkedin-import`, following the auth-service local persistence pattern. Refresh remains intentionally unsupported until LinkedIn confirms a refresh contract for the approved portability application.

The optional narrative-distillation backend can propose bounded `tagline`, `intro`, and `story` copy from the current professional profile. It is dormant: it is neither an agent tool nor an active panel/job path. If exposed later, the panel must show the full proposal for separate confirmation and reject stale profile baselines.

The current walking skeleton imports LinkedIn's documented `PROFILE` snapshot domain. The schema summarizer can inspect `POSITIONS`, `EDUCATION`, `SKILLS`, and `CERTIFICATIONS`, returning only field names, value types, occurrence counts, and deduplicated redacted record shapes—never member values or nested object keys. It has no agent-facing surface. Provider-neutral stable fingerprints and append-only merging are ready for these rich records, but their mappers remain disabled until representative sanctioned API/export fixtures confirm the source contracts. The transform registry is the single enablement point: preview and execution automatically fetch every registered domain, while unregistered domains remain inspection-only.

OAuth is configured through the instance's `brain.yaml`, not model-owned environment-variable names. Managed mode is configured on Rover's built-in capability:

```yaml
plugins:
  linkedin-import:
    oauth:
      mode: broker
      baseUrl: https://connect.rizom.ai
      instanceId: rover-example
      instanceSecret: ${MY_BROKER_INSTANCE_SECRET}
```

Direct/self-hosted mode is explicit:

```yaml
plugins:
  linkedin-import:
    oauth:
      mode: direct
      clientId: your-linkedin-client-id
      clientSecret: ${MY_LINKEDIN_CLIENT_SECRET}
      redirectUri: https://brain.example/linkedin/oauth/direct/callback
```

The instance chooses its secret names and declares them in its own `.env.schema` when deployment validation is required. An `accessToken` plugin setting remains an optional static fallback during migration.

The API requires the `r_dma_portability_3rd_party` scope and is available only for consenting EEA members. Non-EEA export-ZIP support is planned separately.

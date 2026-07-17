# @brains/linkedin-import

Imports the anchor owner's professional profile through LinkedIn's sanctioned DMA Member Data Portability API.

The plugin is inert unless `accessToken` is configured. Its anchor-only `linkedin-import_import` tool fetches a read-only preview and enters the host's typed confirmation flow before queuing a deterministic import job. The job fills absent `anchor-profile` fields and preserves owner-authored values.

The current walking skeleton imports LinkedIn's documented `PROFILE` snapshot domain. The anchor-only `linkedin-import_inspect_schema` tool can inspect `POSITIONS`, `EDUCATION`, `SKILLS`, and `CERTIFICATIONS`, returning only field names, value types, and occurrence counts—never member values. Provider-neutral stable fingerprints and append-only merging are ready for these rich records, but their mappers remain disabled until representative sanctioned API/export fixtures confirm the source contracts.

```yaml
plugins:
  linkedin-import:
    accessToken: ${LINKEDIN_ACCESS_TOKEN}
```

The API requires the `r_dma_portability_3rd_party` scope and is available only for consenting EEA members. Non-EEA export-ZIP support is planned separately.

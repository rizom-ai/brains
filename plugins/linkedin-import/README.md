# @brains/linkedin-import

Imports the anchor owner's professional profile through LinkedIn's sanctioned DMA Member Data Portability API.

The plugin is inert unless `accessToken` is configured. Its anchor-only `linkedin-import_import` tool fetches a read-only preview and enters the host's typed confirmation flow before queuing a deterministic import job. Confirmation is bound to a digest of the exact previewed patch and anchor-profile baseline; the job refetches both and refuses to write if either changed. The job fills absent `anchor-profile` fields and preserves owner-authored values.

The current walking skeleton imports LinkedIn's documented `PROFILE` snapshot domain. The anchor-only `linkedin-import_inspect_schema` tool can inspect `POSITIONS`, `EDUCATION`, `SKILLS`, and `CERTIFICATIONS` individually, or all four in one report with `domain: "ALL_RICH"`, returning only field names, value types, occurrence counts, and deduplicated redacted record shapes—never member values or nested object keys. Provider-neutral stable fingerprints and append-only merging are ready for these rich records, but their mappers remain disabled until representative sanctioned API/export fixtures confirm the source contracts. The transform registry is the single enablement point: preview and execution automatically fetch every registered domain, while unregistered domains remain inspection-only.

```yaml
plugins:
  linkedin-import:
    accessToken: ${LINKEDIN_ACCESS_TOKEN}
```

The API requires the `r_dma_portability_3rd_party` scope and is available only for consenting EEA members. Non-EEA export-ZIP support is planned separately.

# @brains/linkedin-import

Imports the anchor owner's professional profile through LinkedIn's sanctioned DMA Member Data Portability API.

The plugin is inert unless `accessToken` is configured. Its anchor-only `linkedin-import_import` tool queues a deterministic import job that fills absent `anchor-profile` fields and preserves owner-authored values.

The current walking skeleton imports LinkedIn's documented `PROFILE` snapshot domain. Position, education, skill, and certification domains remain disabled until representative sanctioned API/export fixtures confirm their source keys.

```yaml
plugins:
  linkedin-import:
    accessToken: ${LINKEDIN_ACCESS_TOKEN}
```

The API requires the `r_dma_portability_3rd_party` scope and is available only for consenting EEA members. Non-EEA export-ZIP support is planned separately.

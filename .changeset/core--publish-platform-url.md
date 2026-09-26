---
"@brains/content-pipeline": patch
---

Store the platform URL a publish provider returns. `PublishResult` carries an optional `url` and the LinkedIn client populates it, but `markEntityPublished` read only `result.id`, so the URL was computed and discarded. It is now stored as `platformUrl` when present — the URL format lives inside the provider, so `platformId` alone does not let anything downstream reconstruct it.

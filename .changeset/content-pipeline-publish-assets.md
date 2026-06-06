---
"@rizom/brain": patch
---

Consolidate content-pipeline publishing through provider-mode execution and add publish asset reconciliation for generated assets such as blog OG images. Published posts now enqueue missing publish assets after publish or published entity updates, and the content pipeline exposes an ensure-assets tool for backfills.

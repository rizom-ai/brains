---
"@rizom/brain": patch
---

A brain that crashed during a large import starts again in seconds. Recovering the import batches a crashed start left open read the whole job queue once per batch, so each crash made the next start slower until it missed its startup deadline every time; a batch's jobs are now found through an index on their root job.

---
"@rizom/brain": patch
---

Make Site build status truthful: reconcile active attempts from the durable job queue whenever Studio or Dashboard loads, record unchanged-input jobs as skipped instead of successful renders, keep previous failures attached to their own attempts, and report the generation selected by each active output manifest.

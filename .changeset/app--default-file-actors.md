---
"@brains/app": patch
"@brains/core": patch
"@rizom/brain": patch
---

Provision native file actors for normal application startup and give combined apps an authenticated loopback endpoint on their existing database owner. Package all fifteen actor artifacts and retain PDF.js's worker/native dependency layout. Copy split-library SQL workers after chunk cleanup so authentication can start from the installed package.

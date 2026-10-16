---
"@rizom/ops": patch
---

A pilot user's `siteOverride` can select a site bundled in `@rizom/brain` (any `@brains/*` package, such as `@brains/site-organization`) without a version pin; the Brain version pins it, and it is never npm-installed into the image. External `@rizom/*` site packages still require an exact `version`, and a `version` on a bundled package is rejected.

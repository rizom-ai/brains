---
"@rizom/ops": patch
---

`verify-user`: parse `/health` response with Zod instead of a cast, collect per-check failures so an early failure doesn't hide later ones, and report passed and failed checks together. Drop the misleading "content repo" claim from the docs.

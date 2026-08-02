---
"@brains/site-composition": patch
---

Unwrap `ZodDefault` when deriving section template field mappings. Fields authored as `z.string().nullable().default(null)` (as in `@rizom/site-rizom-ai`) threw at plugin-init time, which took down the whole site-package plugin and dropped every custom section from the build with missing-template warnings.

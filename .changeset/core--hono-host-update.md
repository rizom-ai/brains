---
"@rizom/brain": patch
---

Update HTTP Host and A2A to Hono 4.13.13 without restoring the retired webserver interface. Preserve declared route admission and preview boundaries, and cover conditional static responses through the running HTTP host: successful GET revalidation, whitespace and wildcard validators, and preservation of error and non-GET responses.

Retain Hono's stricter default for static paths with percent escapes remaining after path decoding; do not opt back into serving literal-percent filenames through that middleware. Ordinary encoded spaces and Unicode filenames remain covered. This is a bounded dependency update, not a clean-security-audit claim or a change to guest network authority.

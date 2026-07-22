---
"@rizom/brain": patch
"@rizom/ops": patch
---

Align preview URL topology across runtime metadata and fleet deployment. Dedicated domains use `preview.<domain>`, while direct sites under the shared `rizom.ai` parent use `<site>-preview.rizom.ai` so both hosts remain covered by one-level wildcard TLS.

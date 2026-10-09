---
"@rizom/brain": patch
---

Analytics queries accept Cloudflare's `errors: null` on a successful response; every query failed with "expected array, received null".

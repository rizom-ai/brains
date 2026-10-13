---
"@rizom/brain": patch
---

Serve a brain's stored identity from boot in every process. While the startup import is pending, or after it failed, the web process previously never read the brain character and anchor profile already in its database and advertised "Brain is Unknown's Knowledge assistant". Defaults are still created only after a successful startup sync.

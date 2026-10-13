---
"@rizom/brain": patch
---

Site builds collect head scripts through the narrow `siteContributions.headScripts` setup reader before rendering. Analytics answers through a schema-validated, all-role subscription, so its configured beacon reaches worker-built pages without a ready-phase registration. Configured site scripts remain first. Invalid or failed contributions reject the build rather than silently publishing incomplete output; no arbitrary-topic collector or native bus is exposed.

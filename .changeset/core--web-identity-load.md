---
"@rizom/brain": patch
---

Load stored identity caches before serving HTTP in ordinary boots, including while startup content is pending or after its import fails. Keep worker loading and register-only behavior unchanged. Cache refresh does not create missing identity documents or announce startup settlement; default creation remains on the existing successful/no-pending startup and startup-check paths. Later imports still refresh local identity through the existing subscriptions.

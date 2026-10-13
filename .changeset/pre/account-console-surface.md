---
"@brains/admin": patch
"@brains/auth-service": patch
"@brains/console-theme": patch
"@rizom/brain": patch
---

Move the authenticated `/account` UI out of auth-service into a dedicated account console plugin. Keep session-derived account APIs in auth-service while giving self-service the shared console shell, climate, route-derived navigation, responsive React UI, and bundled runtime asset.

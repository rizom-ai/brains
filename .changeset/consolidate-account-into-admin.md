---
"@brains/admin": patch
"@rizom/brain": patch
---

Fold the account console into the admin package as a second plugin and browser bundle. Admin and account are two surfaces over the same people domain, so they now share one package, the detail-layout primitives, and one stylesheet, while keeping separate plugin registrations, admission levels, routes, and JS bundles — a non-admin browser still never downloads the admin SPA.

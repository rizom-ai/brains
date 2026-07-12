---
"@rizom/site-rizom": patch
"@rizom/site-rizom-ai": patch
"@rizom/site-rizom-work": patch
"@rizom/site-rizom-foundation": patch
"@rizom/site-docs": patch
---

Pin concrete versions of published @rizom dependencies in the site package manifests. npm builds the registry dependency metadata from the on-disk manifest before prepack rewrites it, so `workspace:*` ranges shipped uninstallable packuments (0.2.0-alpha.144/145) even though the tarball manifests were clean.

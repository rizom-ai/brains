---
"@rizom/site-rizom": patch
"@rizom/site-rizom-ai": patch
"@rizom/site-rizom-work": patch
"@rizom/site-rizom-foundation": patch
"@rizom/site-docs": patch
---

Republish the public site packages with concrete pinned dependencies. npm builds the registry dependency metadata from the on-disk manifest before prepack rewrites it, so the `workspace:*` ranges in 0.2.0-alpha.144/145 shipped uninstallable packuments even though the tarball manifests were clean.

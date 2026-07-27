---
"@rizom/site-docs": patch
"@rizom/site-rizom": patch
"@rizom/site-rizom-ai": patch
"@rizom/site-rizom-foundation": patch
"@rizom/site-rizom-work": patch
"@rizom/site-smoke-canary": patch
"@rizom/theme-default": patch
"@rizom/theme-rizom-ai": patch
"@rizom/theme-signal": patch
---

Reject published site/theme manifests that ship unresolved `workspace:` specifiers in any dependency field. The release-time peer-metadata check now guards against the alpha.144/145 packument failure mode (a `workspace:*` range surviving into the registry manifest) in addition to the `@rizom/brain` peer range and authoring-only field checks.

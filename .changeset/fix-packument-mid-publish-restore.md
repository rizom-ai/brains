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

Publish correct registry metadata for site and theme packages. `postpack: publish-manifest restore` put the authoring manifest back mid-publish, and npm derives the registry packument from the on-disk manifest _after_ postpack — so every release shipped a correct tarball alongside a packument that retained `publishPeerDependencies` and dropped the real `@rizom/brain` peer range (0.2.0-alpha.231 and .232 are affected; the same mechanism caused the earlier `workspace:*` packuments). Restoring is now done once by the release wrapper after the whole publish completes, and a drift-guard test fails if any publishable package reintroduces a mid-publish restore.

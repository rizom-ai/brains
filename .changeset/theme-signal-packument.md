---
"@rizom/theme-signal": patch
---

Pin the published `@rizom/theme-default` dependency to a concrete version in the source manifest. npm creates registry dependency metadata before `prepack`, so the workspace protocol in the initial release produced an uninstallable packument even though its tarball manifest was valid.

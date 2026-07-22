---
"@brains/plugins": patch
"@brains/webserver": patch
"@brains/cms": patch
"@brains/dashboard": patch
---

Replace CMS hash doors with canonical path routing. Collections, entities, and optional workspaces now support direct loading, refresh, browser Back and Forward, custom CMS mounts, and dirty-draft navigation protection. Dashboard entity doors use canonical CMS detail paths, and the web route contract supports explicit segment-aware prefix routes for authenticated SPA shells.

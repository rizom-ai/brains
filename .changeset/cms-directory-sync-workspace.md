---
"@brains/plugins": patch
"@brains/directory-sync": patch
"@brains/cms": patch
"@brains/dashboard": patch
---

Add an optional CMS Sync workspace backed by a sanitized directory-sync operational snapshot. Operators can inspect watcher, file, Git, recent-run, and quarantine state and request the existing normal sync flow from CMS, while Dashboard remains read-only and links to the workspace when available.

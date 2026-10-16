---
"@rizom/brain": patch
---

`port` in `brain.yaml` now sets the port the production server listens on, not only the URLs the brain prints. An explicit `plugins.webserver.productionPort` still takes precedence.

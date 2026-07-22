---
"@brains/console-theme": patch
"@brains/dashboard": patch
"@brains/web-chat": patch
"@brains/cms": patch
---

Cross-surface ⌘K jump: an operator-gated /api/console/jump endpoint on
the dashboard returns grouped doors (entity search hits open canonical CMS
detail paths, widget groups open dashboard tabs), and a shared vanilla
palette in @brains/console-theme — wired to the strip's ⌘K on all three
surfaces — renders them. The CMS editor honors configurable
/entities/{type}/{id} paths, and chat appends its local conversations to
the palette and resumes sessions from #s/{id} doors.

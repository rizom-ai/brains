---
"@brains/console-theme": patch
"@brains/dashboard": patch
"@brains/web-chat": patch
"@brains/cms": patch
---

Cross-surface ⌘K jump: an operator-gated /api/console/jump endpoint on
the dashboard returns grouped doors (entity search hits open in the CMS
editor via hash deep-links, widget groups open dashboard tabs), and a
shared vanilla palette in @brains/console-theme — wired to the strip's
⌘K on all three surfaces — renders them. The CMS editor honors
#/{type}/{id} deep-links, and chat appends its local conversations to
the palette and resumes sessions from #s/{id} doors.

---
"@brains/console-theme": patch
"@brains/dashboard": patch
"@brains/plugins": patch
---

Extract the operator-console token sheet into @brains/console-theme: one
--console-\* vocabulary with two climates (instrument/paper) plus the shared
console-strip chrome, replacing the dashboard's --dashboard-\* tokens. The
strip's surface links now derive from registered web routes (service plugin
contexts gain read access to the web-route registry), and the light/dark
toggle becomes the console-wide climate preference persisted as
console.climate.

---
"@brains/content-service": patch
"@brains/templates": patch
"@brains/site-builder-plugin": patch
---

Add an opt-in content overlay so a datasource-backed section can also carry
content-authored fields. A template may declare an `overlayFormatter`; when it
does, its section's saved site-content is parsed and merged over the datasource
output (authored fields win, then the merge is validated against the template
schema), instead of datasource and saved content being mutually exclusive.
Site-builder now offers every section its own saved content alongside any
dataQuery. Templates without an overlayFormatter are unchanged — the datasource
still wins outright and the saved entity is never read. This lets a live
section (e.g. the agent proximity map) keep real-time data while its hero copy
is edited like any other markdown section.

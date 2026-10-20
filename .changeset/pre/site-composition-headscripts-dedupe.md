---
"@brains/site-composition": patch
---

extendSite: replace head scripts instead of concatenating base + override.
Both rizomBaseSite and createRizomSite emit buildRizomHeadScript(), so the
concat shipped /boot.js twice — each copy bound its own #themeToggle click
listener and one click toggled the theme twice, making the light-mode
toggle a visible no-op.

---
"@brains/agent-discovery": patch
---

The proximity map's site hero copy (kicker, heading, lede, CTA) is now
content-authored. The template renders optional copy fields with the previous
strings as defaults, and the section registers an overlayFormatter so a site
edits the copy as an ordinary markdown section while the map data stays live
(via the content-overlay merge). Brains that author nothing render exactly as
before.

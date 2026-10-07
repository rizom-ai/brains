---
"@rizom/brain": patch
---

Preserve site-resolved RSS item routes in declarative feeds. The site builder supplies the same entity URL generator used by staged artifacts, so custom routes such as `/essays/<slug>` reach both RSS links and GUIDs, with `/posts/<slug>` as the default post route. Feed declarations still contribute content only; output paths, route resolution and publication filtering remain host-owned.

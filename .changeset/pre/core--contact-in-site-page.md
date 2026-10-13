---
"@rizom/brain": patch
---

The contact form now appears inside the site's own page. The contact plugin gives the site `/contact` and `/contact/thanks` pages that the site builds with its own layout, fonts, bar and footer around an empty slot; on each request the plugin fills the slot with the form and its one-time token, so the form still works without JavaScript. A route handler can return a `SitePageResponse` with a slot for this, and the webserver fills the slot for any method or status, falling back to the handler's own page where the site has no such page. Every brain site gets a contact page in its own look, the professional and organization sites included.

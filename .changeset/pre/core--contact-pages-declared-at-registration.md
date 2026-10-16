---
"@rizom/brain": patch
---

The contact plugin declares the site's `/contact` and `/contact/thanks` pages while it registers, with `site-builder` as a dependency so the builder is listening. A deployment builds its site in a worker process that registers plugins but never runs their ready phase, so pages declared at readiness never reached it and the built site had no contact page.

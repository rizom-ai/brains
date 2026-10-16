---
"@brains/webserver": patch
---

Stop serving js/css with immutable cache headers on production. main.css and
boot.js live at stable URLs and are rebuilt in place on every site build, so
the year-long immutable header let the CDN edge serve new pages against
stale styles (the first /essays detail page rendered unstyled this way).
They now revalidate via etag (no-cache); images and fonts stay immutable.

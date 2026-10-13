---
"@rizom/brain": patch
---

Site builds ask plugins for layout slots as they render, so the newsletter signup reaches the built footer; registered on `pluginsRegistered`, it never reached the worker process that builds the site.

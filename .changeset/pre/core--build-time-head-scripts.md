---
"@rizom/brain": patch
---

Site builds ask plugins for head scripts as they render, through the new `context.messaging.collect`, so the analytics beacon reaches the built pages; registered from the ready phase, it never reached the worker process that builds the site.

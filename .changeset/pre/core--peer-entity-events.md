---
"@rizom/brain": patch
---

The web and worker processes tell each other about entity changes. A brain's identity, and Studio's activity feed, follow writes made in either process, such as content the worker syncs from git, without a restart.

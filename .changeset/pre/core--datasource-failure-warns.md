---
"@rizom/brain": patch
---

A section whose data source fails is logged as a warning, naming the template and the error. It was logged at debug level only, so a page section that rendered empty (as yeehaa.io's homepage did) left nothing in the log.

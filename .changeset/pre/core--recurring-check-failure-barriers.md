---
"@brains/recurring-checks": patch
"@rizom/brain": patch
---

Wait for every recurring-check cleanup task before reporting service-stop or plugin-unregistration failures. Preserve a single cleanup error and aggregate multiple failures instead of letting the first failed schedule bypass sibling drains.

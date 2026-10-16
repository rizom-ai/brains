---
"@brains/site-builder-plugin": patch
---

The site builder's rebuild at start waits until the brain's startup content has settled, so a brain whose startup import is still queued no longer renders its site before that content is in.

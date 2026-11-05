---
"@brains/doc": patch
"@rizom/brain": patch
---

Creating a doc no longer offers a trusted writer the sections of restricted docs when it asks where the page goes. Create checks and interceptors now see the caller's permission level; the page still takes the next place after every doc.

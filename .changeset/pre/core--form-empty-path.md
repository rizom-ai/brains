---
"@rizom/brain": patch
---

A form whose file names no path is stored without one and served beneath `/forms/<id>`, as the forms engine serves any form without a path. A form an earlier release stored with an empty path reads as a form without one, and its next write drops the empty path.

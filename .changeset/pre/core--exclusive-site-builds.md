---
"@rizom/brain": patch
---

A job type can be exclusive: the queue claims a second job of it only once the first settles. Site builds are exclusive and get a 10-minute deadline, so a waiting build no longer runs out its deadline inside a claimed job.

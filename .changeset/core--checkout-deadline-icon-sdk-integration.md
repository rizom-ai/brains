---
"@brains/core": patch
"@brains/directory-sync": patch
"@brains/http-host": patch
"@brains/job-queue": patch
"@brains/plugins": patch
"@rizom/brain": patch
---

Integrate in-place, upstream-tracking Git bootstrap, progress-renewed job deadlines and the shared fallback icon without restoring native authoring bridges. The shell-owned HTTP host serves the fallback icon and avoids immutable caching of missing static assets.

Keep startup continuation lifecycle-owned while consuming the initial import's success or failure. Failed imports do not create defaults or announce settled content; the existing index can still become available. A batch already failed or missing at the first authoritative status read must also keep the shell waiting for its failed outcome, rather than admitting defaults over unimported authored files. Entity seed declarations also require an explicitly successful sync outcome; failed or malformed completion signals cannot seed an empty database over unimported authored files.

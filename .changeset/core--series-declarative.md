---
"@rizom/brain": patch
---

The series are a declarative entity package. Series are stored, rendered and derived as before: the same `series` plugin and type, the `series:series-list`, `series:series-detail` and `series:description` templates, the `series:entities` data source counting and listing the members of every type at the build's scope, the same series projection, keeping a described series and its cover as stored, and the same `ai.rizom.brain.series` records. A series' cover is now also in its metadata, which startup re-derives for a series written by an earlier release. The `series:generation` job type is retired: series are described by the projection, and a job still queued is settled as failed with the public no_handler error.

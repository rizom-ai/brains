---
"@rizom/brain": patch
---

A first-party generation can carry a step that runs after it. Once the record is written, the step is given the id written; when the generation fails, it is given the reason. Either way it gets the generation's input, the package's jobs and its retry scope, as an entity plugin class's generation handler queued its follow-up work.

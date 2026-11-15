---
"@rizom/brain": patch
---

Posts, links, projects and the style guide stored before their types became declarations read correctly before the startup pass repairs their metadata. A read whose stored metadata lacks a field the type now requires takes that metadata from the entity's stored markdown, so gets, lists, searches, import plans and retired-field rewrites find the entity on the HTTP host before the pass runs and on boots that never run it (`brain list`, `get`, `search`, `status`, `sync`, `build`, `operate` and `--startup-check`). Reads write nothing; the startup pass still stores the repaired metadata. An entity whose markdown does not decode either is still left out.

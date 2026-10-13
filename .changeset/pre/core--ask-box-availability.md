---
"@rizom/brain": patch
---

The atlas homepage docks the guest chat box on deployments that run a separate worker. Web Chat now records in shared runtime state whether it serves the shared Ask box boot (and on preview), and site builds read that record instead of Web Chat's routes, which a worker does not have. Without the record, or with guest chat off, the homepage keeps only the contact door.

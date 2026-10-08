---
"@rizom/brain": patch
---

Integrate books through declarative entities, datasources and installed capabilities. Keep entity display configuration host-owned without a URL-generator singleton. Each service receives a detached display snapshot, so its edits cannot rewrite host routes or peer citation settings. Preserve publication and visibility floors for semantic origins, related entries and counts.

Validate importer paths before replacement, stage complete books, restore prior output on publication failure and retain a recovery directory if restoration fails. Imports require stopped readers/writers; concurrent imports and crash-atomic directory replacement are not supported. HTML parsing executes no scripts or subresource loads.

Clear repository-local Git environment variables only in the pre-commit test subprocess, so foreign test repositories cannot alter the committing worktree, including when Turbo uses loose environment forwarding. Index checks retain the original hook environment.

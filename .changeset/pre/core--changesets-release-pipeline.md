---
"@brains/build-tools": patch
---

Migrate repository release tooling to Changesets 3 and Manypkg 3, removing the vulnerable braces tooling chain while preserving core/site isolation, private package versioning, peer-dependent bump policy, and coordinated stable exit. Validate archived prerelease references and transition existing history before versioning with rollback-safe source preservation. This does not remediate the separate gray-matter/sprintf-js runtime dependency.

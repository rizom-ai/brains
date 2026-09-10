---
"@brains/build-tools": patch
"@rizom/brain": patch
---

Require successful CI for the exact checked-out source before either release lane versions or publishes packages. Obtain missing CI for serialized version-only advances, wait with a deadline, and reject failed or mismatched evidence.

Keep coordinated stable-graduation provenance across follow-up commits and retries, retaining the final Brain alpha and Site-first registry gates until stable Brain publication completes. Fail closed when provenance or registry state cannot be established, and recheck Site release classification after queueing.

Bind private packed fixtures to the exact SDK artifact being tested instead of retaining stale source-template peer pins after versioning. Verify installed fixture metadata in registry evidence and check the Site fixture's declared React-compatible dependency without a Site override.

Add future-alpha/stable packing, real Git history, CI revision-selection, and workflow regressions. No merge, prerelease exit, CI/release dispatch, publication, or dist-tag change is performed by these source changes.

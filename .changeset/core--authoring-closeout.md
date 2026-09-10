---
"@brains/templates": patch
"@brains/auth-service": patch
"@brains/admin": patch
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

Give attachment-provider factories exactly their declared media context: domain, theme CSS, profile reads, and entity reads. Freeze and bind the reader handles instead of forwarding the full entity plugin context.

Return detached view script and static-asset metadata so editing a reader's result cannot change subsequent renders or other readers. Preserve declared schema and renderer identities. Use the real template and renderer registries in the public harness instead of empty view stubs.

Report an absent brain anchor with `not_found` and make the Admin workspace check that code rather than error wording. Remove the unused internal `reconcileEntities` implementation and exports, not just the already-removed SDK names.

Cover the boundaries through source, built, and packed public consumers, direct renderer tests, and real auth/Admin regressions. No persisted content, state keys, upload paths, or migration behavior changes.

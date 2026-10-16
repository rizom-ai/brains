---
"@rizom/brain": patch
---

Fix agent approval not sticking after directory-sync round-trip. `AgentAdapter.toMarkdown` now rebuilds the frontmatter from entity metadata on every write, so `system_update({ fields: { status: "approved" } })` produces disk markdown that matches the DB. Previously the stale `status: discovered` frontmatter stayed on disk, and the next import clobbered the DB back to discovered — causing agent calls to fail with "not approved yet" after a visibly successful approval.

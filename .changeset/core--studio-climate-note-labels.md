---
"@rizom/brain": patch
---

Fix the console climate toggle when Studio mounts or remounts its React chrome after document readiness. Keep theme tokens, accessible labels, and the shared preference synchronized.

Restore note title fallbacks to the first nonblank body line when no frontmatter title or body H1 exists. Studio requests adapter metadata projections for list and detail labels, so stored Untitled placeholders also display useful titles without a database backfill or read-side writes. Preserve authored titles and source content.

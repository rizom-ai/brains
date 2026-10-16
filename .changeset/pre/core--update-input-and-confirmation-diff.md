---
"@brains/core": patch
"@brains/ai-evaluation": patch
"@rizom/brain": patch
---

Add exact-match `edits` to agent-backed `system_update` so small changes do not require regenerating an entire document. Reject missing, ambiguous, overlapping, and mixed-mode edits; preserve confirmation and content-conflict protection. Refresh changed source-derived metadata so a note heading edit also updates its title. Reject entity updates that supply both fields and content instead of silently discarding content. Align confirmation preview lines so insertions and deletions do not mark an unchanged suffix as rewritten, and preserve visible blank-line changes. Add long-note coverage for exact content and backslash preservation through confirmation.

Add agent evals for 7, 14, and 17 KB note edits and combined title/body edits. Exact tool-result assertions verify stored Markdown after cancellation and approval, rather than relying on the assistant's success claims.

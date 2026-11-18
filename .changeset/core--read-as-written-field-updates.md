---
"@brains/entity-service": patch
"@rizom/brain": patch
---

A field update to a type read as written now persists. Approving or archiving a saved agent with system_update reported "Updated agent." but stored nothing: the agent's read hands back its header as stored, and the update laid that unchanged header back over the new status. Only the header fields an update changes against the stored document now count as written, so a field change reaches storage and a header an editor rewrites still wins. Forms, topics, SWOT assessments and conversation summaries, also read as written, were affected the same way.

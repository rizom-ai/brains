---
"@rizom/brain": patch
---

A user-message source whose boundaries do not select content now names the failing boundary and why — missing, repeated, or out of order — and says how to select everything after an instruction with a literal `startAfter` and no `endBefore`. Before, one generic refusal told the model to ask for clarification, and models asked users to resend pasted posts whose frontmatter `---` lines repeat.

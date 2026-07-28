---
"@brains/ai-service": patch
"@brains/ai-evaluation": patch
"@brains/rover": patch
---

Treat authenticated Anchor and permission facts as authoritative model context. Non-Anchor callers now receive a definitive relationship, permission answers use canonical Admin/Trusted/Public labels, prompt-substring tests are replaced by resolved-principal integration coverage, and behavioral evaluation fixtures cover personal Anchor/Admin, Trusted non-Anchor, additional Admin non-Anchor, and Public callers.

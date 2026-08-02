---
"@brains/ai-service": patch
"@brains/ai-evaluation": patch
---

Treat authenticated Anchor and permission facts as authoritative model context. Non-Anchor callers now receive a definitive relationship, permission answers use canonical Admin/Trusted/Public labels, and prompt-substring tests are replaced by resolved-principal integration coverage plus passing behavioral model evaluations for personal Anchor/Admin, Trusted non-Anchor, additional Admin non-Anchor, and Public callers.

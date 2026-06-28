---
"@rizom/brain": patch
"@brains/ai-service": patch
"@brains/rover": patch
---

Fix web-chat upload follow-ups so singular references such as “the uploaded image” and “the uploaded PDF” resolve to the newest matching live upload, and hydrate prior PDF uploads for read-only summaries even when a prior assistant response is also saveable.

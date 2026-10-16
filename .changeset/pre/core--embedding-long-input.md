---
"@brains/ai-service": patch
---

Entities longer than the embedding model's input limit are embedded instead of failing every time. Text over 8,191 tokens was sent in one request, which OpenAI rejects, so long notes never entered semantic search and the index stayed degraded. Such text is now split into chunks, at paragraph, line or word boundaries where possible and never inside a character, embedded within OpenAI's per-request limits, and combined into one length-weighted vector of unit length. Text within the limit is embedded as before.

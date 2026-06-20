---
"@brains/ai-service": patch
"@brains/agent-discovery": patch
"@brains/a2a": patch
"@brains/social-media": patch
---

Harden the assistant instructions on identity disclosure and tool routing:

- never reveal the configured anchor/profile identity when answering "am I your anchor?" or "am I {name}?" — answer from the current permission level only, without confirming or denying via the configured profile details
- treat an ambiguous "make one draft" follow-up as a clarification, never self-selecting a published item and never firing `system_update` to resolve it
- for source-derived artifact saves, resolve a source named by title or slug through `system_get` first, then continue to `system_create` with the returned canonical id in the same turn instead of retrying guessed slugs or stopping after the lookup
- when `system_extract` is unavailable to the caller, say the caller cannot generate/extract topics with their current permissions instead of substituting `system_search` and presenting existing topics as newly generated
- keep uploaded image/document saves on the upload path without generation prompts, summarize listed items from retrieved content when list results are metadata-only, keep saved-agent follow-ups routed through A2A, and keep URL-only agent refusals from surfacing wishlist internals
- keep prompt-only LinkedIn generation grounded in the user prompt instead of adjacent knowledge-context themes

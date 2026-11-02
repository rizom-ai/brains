---
"@rizom/brain": patch
---

When the AI provider declines a chat turn on content policy, the brain retries that turn once with the same message before any tool has run. If the provider declines again, the reply is "The AI provider declined this request. Try rephrasing your message." instead of a generic error.

---
"@brains/web-chat": patch
---

Resolve the `?id` conversation through one helper in the session and message
handlers. The message handler restated the id-param/access-check/400/404
sequence statement for statement; it now calls the session handlers'
`resolveWebChatSession`, so the semantics cannot drift between routes.

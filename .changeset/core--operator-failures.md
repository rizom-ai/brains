---
"@brains/admin": patch
"@brains/plugins": patch
"@brains/studio": patch
"@rizom/brain": patch
---

An operator surface's failure reaches Studio in its public form, `{ error, code }`, with the HTTP status its code names. A workspace callback's `SdkError` keeps its code and public message, any other error is `handler_failed`, input or query state its schema refuses is `invalid_input` naming the offending paths, an undeclared action is `not_found`, a request below its permission is `permission_denied`, a stale prepared confirmation is `conflict`, and an answer outside what the surface declares is `invalid_response`. The diagnostic and its cause stay in the declaring package's log; Studio no longer shows the operator a message naming the package and surface, and a callback's own public message is no longer dropped. The Administration workspace refuses an action it does not route by code.

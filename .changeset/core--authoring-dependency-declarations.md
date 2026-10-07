---
"@brains/document-plugin": patch
"@brains/image-plugin": patch
"@brains/studio": patch
"@brains/chat-repl": patch
"@brains/sdk": patch
"@brains/app": patch
"@rizom/brain": patch
---

Declare the utility dependencies used by Document and Image and Studio's messaging-service test dependency. Move pure brain composition and configuration contracts from the app to the SDK so Chat REPL can declare its SDK dependency without closing the SDK-to-app-to-REPL cycle. The app consumes the same definitions and schemas; the SDK no longer depends on app startup. Public authoring names, schema defaults and runtime boot order are unchanged. Remove the private app composition subpath and update its internal consumers rather than keeping a compatibility alias.

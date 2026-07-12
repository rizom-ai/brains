---
"@brains/web-chat": patch
"@brains/console-theme": patch
"@brains/dashboard": patch
---

Web-chat joins the console: the chat page serves the shared
@brains/console-theme sheet and the console strip (route-derived surface
links, operator session chip), its --chat-\* palette copies are replaced by
console tokens plus a thin chat-only block, and the in-app theme toggle
becomes the console-wide climate toggle (console.climate,
instrument/paper). Surface derivation and the climate script move into
@brains/console-theme; the dashboard imports them from there.

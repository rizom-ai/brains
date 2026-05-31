---
"@brains/webserver": patch
---

Set an explicit Bun.serve idle timeout so long streaming responses survive. The
web-chat `POST /api/chat` stream stays silent while the agent runs synchronously
(cold model init + tool loop + an uploaded file's full content in the prompt); a
slow first turn exceeded Bun's 10s default idle timeout and the socket was closed,
surfacing in the UI as a "[ signal lost ]" network error. Stream writes do not reset
Bun's idle timer, so the timeout itself now covers the worst-case turn.

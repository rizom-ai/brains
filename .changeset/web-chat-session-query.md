---
"@brains/web-chat": patch
---

Move saved-session metadata, conversation-history loading, and session mutations into package-local TanStack Query ownership with typed keys and exact request-count coverage. Reopened history is copied into the AI SDK, which remains the exclusive owner of active and streamed messages.

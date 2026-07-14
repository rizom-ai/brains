---
"@brains/web-chat": patch
---

Move saved-session metadata and conversation-history loading into a package-local TanStack Query cache with typed keys and exact request-count coverage. Reopened history is copied into the AI SDK, which remains the exclusive owner of active and streamed messages.

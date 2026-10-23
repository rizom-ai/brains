---
"@rizom/brain": patch
---

The conversation service no longer broadcasts `conversation:digest` every few messages; nothing listened to it. `ConversationDigestPayload`, `conversationDigestPayloadSchema` and the service's digest configuration are gone. A plugin that follows a conversation listens to `conversation:messageAdded` and reads the stored messages it needs.

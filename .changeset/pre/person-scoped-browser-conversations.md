---
"@brains/conversation-service": patch
"@brains/plugins": patch
"@brains/web-chat": patch
---

Persist nullable indexed person ownership for browser conversations and scope Trusted web-chat and remote-agent reads, titles, messages, actions, and mutations to the authenticated person. Preserve Admin cross-person access, legacy unowned conversations, and `channelId` stream routing.

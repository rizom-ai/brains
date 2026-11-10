---
"@rizom/brain": patch
---

Chat (Discord and Slack) is a declarative interface. It routes messages, approvals, cards, job progress and tool statuses as before, and keeps uploads in the runtime's shared upload store. The per-platform upload stores it kept before July 2026 are retired: chat deletes `data/discord-chat/uploads` and `data/slack-chat/uploads` at startup, and their old URLs, `/api/webhooks/chat/discord/uploads` and `/api/webhooks/chat/slack/uploads`, now answer 404.

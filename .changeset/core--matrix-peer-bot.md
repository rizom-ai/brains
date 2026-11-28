---
"@brains/chat": patch
"@brains/contracts": patch
"@brains/matrix-server": patch
"@rizom/brain": patch
---

A brain answers another brain's Matrix bot only when that bot mentions it. Matrix marks everyone but a brain's own bot as unknown, so a peer brain's bot, `@_brain` on its own server, counted as a person: once it mentioned a brain in their shared room, that brain answered everything it said after, and two brains could keep answering each other. A brain's bot on any server is now a bot to routing, like a bot on Discord or Slack.

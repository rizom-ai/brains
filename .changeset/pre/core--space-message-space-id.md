---
"@rizom/brain": patch
---

Each message a chat interface stores for a configured space records the space it belongs to (`spaceId`, e.g. `discord:<channel id>`), so plugins can tell a space's messages apart without parsing the chat SDK's composite channel ids, which selectors do not match.

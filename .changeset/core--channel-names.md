---
"@rizom/brain": patch
---

Chat messages and cards name their channel as the chat app does ("#executive-room") instead of carrying Discord's composite channel id, which also broke the board's layout. A card whose channel has no name shows the app ("Discord") rather than the id, including cards stored before this change.

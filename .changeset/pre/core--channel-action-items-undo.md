---
"@rizom/brain": patch
---

Undo on a channel notice takes the card back: the card is deleted unless the board has already changed it, the notice strikes it through with who removed it, and the pickup never writes that card again. A card the board changed stays, and the notice says so. Chat interfaces send a click on any space notice to `chat:space-notice-action`, and the plugin that posted the notice answers with its new content.

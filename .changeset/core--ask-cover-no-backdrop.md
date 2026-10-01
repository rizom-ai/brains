---
"@rizom/brain": patch
---

While the phone Ask sheet covers the page, no blur on the page behind it paints. Safari kept drawing a hidden frosted header's blur, so a text-less bar sometimes showed at the top of the open sheet. The cover now switches blur off everywhere but the sheet, and restores it when the sheet closes. The Ask box contract gains `ASK_COVER_ATTRIBUTE` and `ASK_COVER_STYLE`.

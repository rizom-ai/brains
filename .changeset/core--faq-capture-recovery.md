---
"@rizom/brain": patch
---

Make new FAQ captures restart-safe with native mutation receipts committed atomically alongside their FAQ writes. Preserve existing ambiguous claims without automatically replaying them, and prevent repeated attempts from incrementing asked counts or recreating deleted FAQs. Classification may still repeat; no public authoring capability is added.

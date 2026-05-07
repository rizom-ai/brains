---
"@rizom/brain": patch
"@rizom/ui": patch
---

Fix professional/default site rendering with shared Rizom ecosystem sections and deck views.

- Align the header brand/wordmark with the same content edge used by professional homepage sections.
- Expose default-theme compatibility tokens for shared Rizom UI fonts and accent colors so ecosystem text is color-correct in dark mode without local site shims.
- Give presentation decks a reliable themed background fallback in dark mode.

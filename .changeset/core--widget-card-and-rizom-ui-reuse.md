---
"@rizom/brain": patch
---

Add a shared `WidgetCard` shell to `@rizom/brain-ui` so dashboard widgets stop repeating their panel, title row, and empty state, and make `@rizom/ui` depend on `@rizom/brain-ui` instead of carrying byte-copies of `cn` and `renderHighlightedText`.

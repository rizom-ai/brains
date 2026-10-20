---
"@rizom/brain": patch
---

Add a shared `WidgetCard` shell to `@brains/ui-library` so dashboard widgets stop repeating their panel, title row, and empty state, and make `@rizom/ui` depend on `@brains/ui-library` instead of carrying byte-copies of `cn` and `renderHighlightedText`.

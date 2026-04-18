---
"@rizom/brain": patch
---

Fix the publication pipeline dashboard widget so its status tabs work again, and move the pipeline card to the end of the dashboard widget stack.

This follow-up update:

- restores working pipeline tab switching in the dashboard renderer
- keeps each tab compact with an internally scrollable list
- preserves the calmer, denser pipeline presentation
- renders the publication pipeline after the other secondary widgets

---
"@brains/web-chat": patch
---

Two mobile fixes against the just-shipped drawer:

- Move the hamburger menu button out of the right-hand actions group so
  it anchors to the left edge of the header (matching the mockup, where
  the menu button sits opposite the theme / new actions).
- Fix the drawer panel background under light mode. Previously the panel
  used `rgb(from var(--chat-surface-deep) r g b / 0.95)`, which extracts
  the underlying dark RGB even in light mode, leaving the drawer as a
  dark slab on a light page. Now uses `var(--chat-bg-card)` so the
  drawer flips with theme.

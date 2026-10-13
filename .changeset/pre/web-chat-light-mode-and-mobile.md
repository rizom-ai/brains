---
"@brains/web-chat": minor
---

Add light mode and substantial mobile improvements to the web chat. The chat now consumes tokens via the dashboard's `--chat-* → dashboard → theme → hex` alias-chain pattern (instead of duplicating the palette inline), so embedding it in a site or dashboard automatically reskins the surface. A new sun/moon toggle in the chat header flips `data-theme` on `<html>` and persists the choice to `localStorage`; an inline pre-paint init script reads `prefers-color-scheme` (or the stored value) on first load to avoid FOUC. Mobile (≤760px) collapses the sessions panel into a horizontal scrollable pill rail above the chat and tightens the spine gutter; phone portrait (≤480px) disables the drop-cap and shrinks the empty-state glyph.

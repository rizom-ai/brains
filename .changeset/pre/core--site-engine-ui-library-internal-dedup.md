---
"@brains/site-engine": patch
"@brains/ui-library": patch
"@brains/content-formatters": patch
---

Small internal dedups and surface fixes across the site rendering stack.

- site-engine's head collector and HTML shell each carried their own copy of
  the essential head tags; they now share `essentialHeadTags()`, whose asset
  paths are declared inputs instead of strings buried in two modules. The
  collector's private `escapeHtml` gives way to the shared one, and the HTML
  shell's default title is now escaped (it was interpolated raw).
- `resolvedSiteImageSchema` was declared twice inside site-engine; it now
  lives once next to the `ResolvedSiteImage` interface it validates.
  `UISlotRegistry.getSlot` returns the public registration shape instead of an
  unexported internal type, and its two unregister methods share one prune.
- ui-library's `ContentSection` — a full component with zero usages, whose
  items branch reimplemented `ContentList` with drifted markup — is deleted;
  the `ContentItem` type it hosted moves to `ContentListItem`.
- content-formatters' barrel enumerates its exports explicitly instead of
  three wildcard re-exports.

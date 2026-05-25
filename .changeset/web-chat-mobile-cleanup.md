---
"@brains/web-chat": patch
---

Mobile cleanup against the just-shipped drawer:

- Remove the "New" button from the chat header on every breakpoint —
  the sessions panel "+" button already covers that affordance on
  desktop (always visible) and mobile (via the drawer), so the header
  copy was redundant on both.
- Drop the legacy `scrollIntoView` effect + sentinel div in `App.tsx`.
  `Conversation` is now aligned with the AI Elements pattern using
  `use-stick-to-bottom`, which manages its own scroll. Two scroll
  controllers were fighting on every streamed token, manifesting as the
  view jumping up during updates.

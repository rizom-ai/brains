---
"@brains/web-chat": minor
---

Rework the mobile chat layout around a slide-in sessions drawer instead of
the previous pill-rail stack. At ≤760px the sessions panel becomes a
left-side drawer (86% width, max 320px) triggered by a hamburger in the
header, backed by a scrim and a floating close button; tapping a session
auto-closes the drawer. The same `.web-chat-sessions` component is
reused verbatim — the drawer is just chrome (positioning + transform +
backdrop). The mobile header collapses to four icon-only 40px circles
(sessions, brand, theme, new) and drops the eyebrow + subtitle for
vertical real estate. Touch targets meet 44px, the prompt textarea uses
16px to suppress iOS auto-zoom, and prompt + drawer respect
`env(safe-area-inset-bottom)`.

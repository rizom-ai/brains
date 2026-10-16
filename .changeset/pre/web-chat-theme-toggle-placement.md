---
"@brains/web-chat": patch
---

Fix the theme toggle placement in the chat header. On desktop the action
cluster (theme + New) now hugs the top-right corner instead of floating
at the vertical midpoint of the tall eyebrow+h1+subtitle brand block;
`.web-chat-header` switched to `align-items: start` with a padding-top
nudge on `.web-chat-header-actions` so the actions line up with the h1
baseline. On mobile the theme toggle resizes to 40×40 to match the
hamburger trigger and the New button, eliminating the visible
36/40 size mismatch in the three-button row.

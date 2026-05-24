---
"@brains/web-chat": patch
---

Polish the rizom restyle: anchor the mycelial spine at the chat pane's left edge (rather than inside the centered reading column) and collapse tool-result data parts into a minimal `tool · X ▸` debug toggle. Consecutive tool calls now group under a single `N tool calls ▸` container so a multi-tool assistant message reads as one line instead of N. Confirmations keep their instrument-card treatment since they require user action.

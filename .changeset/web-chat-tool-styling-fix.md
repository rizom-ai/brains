---
"@brains/web-chat": patch
---

Fix the unstyled tool-call result block. The ai-elements registry's
`tool.tsx` shipped raw — Radix Collapsible + Tailwind classes that don't
resolve in this build + lucide icons + Badge — so every tool call rendered
as an unstyled Radix div, completely bypassing the existing
`web-chat-data-part-*` CSS that targets `<details>`. Ported `tool.tsx` to
native `<details>`/`<summary>` while keeping the AI Elements export API
(`Tool`, `ToolHeader`, `ToolContent`, `ToolInput`, `ToolOutput`) intact so
call sites don't change. Status now renders as a small `· running` /
`· completed` / `· error` text suffix with a `data-state` attribute for
color (errors/denials red, approval-requested amber). Deleted the
orphaned `code-block.tsx` and added small CSS for the new
`.web-chat-data-part-label` and `.web-chat-data-part-status` selectors.

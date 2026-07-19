---
"@brains/auth-service": minor
"@brains/templates": minor
"@brains/admin": minor
"@brains/ai-service": patch
"@brains/ai-evaluation": patch
"@brains/app": patch
"@brains/core": patch
"@brains/plugins": patch
"@brains/contracts": minor
"@brains/a2a": patch
"@brains/playbooks": patch
"@brains/rover-onboarding": patch
"@brains/mcp-service": patch
"@brains/mcp": patch
"@brains/chat": patch
"@brains/chat-repl": patch
"@brains/discord": patch
"@brains/web-chat": patch
"@brains/dashboard": patch
"@brains/cms": patch
"@brains/sveltia-cms": patch
"@brains/rover": patch
"@brains/relay": patch
"@brains/ranger": patch
"@rizom/brain": patch
---

Separate Admin authorization from Anchor ownership. Permission roles now use only `admin`, `trusted`, and `public`; a generated auth migration converts historical role rows and persists one person-or-collective brain Anchor. Principals expose `isAnchor` independently, personal Anchors must remain active Admins, collective brains can be run by any active Admin, and last-active-Admin protection stays atomic. Propagate both facets through authenticated and configured A2A, evaluation, chat, Discord, MCP, CLI, web-chat, action, tool, confirmation, and model-instruction contexts.

Finish the standalone Admin console target model with an Anchor ownership card, Admin/Anchor member facets, profile and optional peer-brain sections, responsive roster/detail layouts, typed Anchor mutations, and a console-local TanStack Query cache with targeted mutation invalidation.

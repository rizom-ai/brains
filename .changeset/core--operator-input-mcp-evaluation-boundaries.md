---
"@rizom/brain": patch
"@brains/plugins": patch
"@brains/ai-evaluation": patch
---

Preserve raw JSON workspace action inputs through view rendering and parse them once at request admission before passing typed output to execution and prepared-confirmation callbacks. Keep defaults, validation, and confirmation binding intact without applying transforms repeatedly.

Forward MCP evaluator cancellation to chat and confirmation requests, prevent dispatch after cancelled connection setup, and retain the caller's cancellation reason. Reject actor-specific evaluation contexts that the anonymous in-memory MCP transport cannot represent instead of silently claiming identity-scoped coverage.

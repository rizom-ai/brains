---
"@brains/app": patch
"@rizom/brain": patch
---

Prepare the canonical brain for a headless core. The resolver now derives MCP stdio or HTTP transport from webserver selection while preserving explicit instance overrides, and posture-independent CLI/MCP permission rules live on the brain definition rather than member-scoped bundle contributions.

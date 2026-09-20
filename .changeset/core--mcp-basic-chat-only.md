---
"@brains/mcp-service": minor
"@brains/analytics": minor
"@brains/mcp": minor
---

Collapse the MCP basic protocol surface to `chat` and `confirm` only. Omitted `directMcpExposure` now defaults to `"debug"` regardless of `sideEffects`, so raw read tools (`system_search`, `system_get`, `system_list`, status, insights, and job status) are no longer advertised in basic mode. Basic-mode reads and writes now go through the brain agent, keeping its system prompt, context, and confirmation flow in the loop. The analytics Cloudflare query moved from `"basic"` to `"debug"` exposure. Debug mode is unchanged; tools can still opt into the basic surface with an explicit `directMcpExposure: "basic"`.

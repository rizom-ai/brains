---
"@rizom/brain": patch
---

Confirming `agent_connect` or `agent_set_trust_level` over MCP works: the confirm call no longer answers "No pending … confirmation found". A tool called over the plugin tool bus, as MCP calls it, is now the instance the plugin registered, so a confirmation it handed out is still pending when its confirm call arrives; before, each call built the plugin's tools afresh.

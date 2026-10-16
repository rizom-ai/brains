---
"@brains/agent-discovery": patch
---

Fix the proximity-map site template registering under the wrong scoped name. The template key was `agent-proximity-map`, so the plugin registered it as `agent-discovery:agent-proximity-map` while site routes reference `agent-discovery:proximity-map` — the registry lookup missed and the section silently dropped from built pages (the map hero never rendered). The key is now `proximity-map`, and a plugin test pins the scoped template names routes rely on.

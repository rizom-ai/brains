---
"@rizom/brain": patch
---

Add a `dashboard` namespace to the plugin context so widgets register with `context.dashboard.registerWidget({ ... })` instead of addressing the message channel by hand. The namespace supplies `pluginId`, so a widget can no longer register under another plugin's id.

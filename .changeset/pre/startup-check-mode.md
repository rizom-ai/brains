---
"@rizom/brain": patch
---

Add `brain start --startup-check` for external plugin smoke tests. Startup-check mode loads configured plugins, runs `onRegister` and `onReady`, shuts the app down cleanly, then exits without starting daemons or job workers and without requiring a real AI API key.

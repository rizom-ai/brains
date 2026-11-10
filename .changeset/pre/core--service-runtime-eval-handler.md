---
"@rizom/brain": patch
---

A first-party service converted from a class registers the eval handlers its class registered, under its plugin id, through its internal runtime, so the plugin evals that name them, such as `playbooks:goalCheck`, keep running them. A worker registers none.

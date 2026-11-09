---
"@rizom/brain": patch
---

A first-party service composes one Studio workspace from several declared ones through its internal runtime, as its class did: each is built under the plugin's id as a source the composed workspace loads, and the composed workspace registers with Studio once every plugin has registered, never in a worker and not without a Studio.

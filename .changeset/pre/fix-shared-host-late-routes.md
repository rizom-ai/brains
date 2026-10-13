---
"@rizom/brain": patch
---

Fix shared-host route registration so routes from interfaces registered after the webserver, such as A2A, are still available on production deploys.

This restores endpoints like `/.well-known/agent-card.json` and `/a2a` in the no-Caddy shared-host deploy model.

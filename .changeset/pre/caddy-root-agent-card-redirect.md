---
"@rizom/brain": patch
"@rizom/ops": patch
---

Restore an explicit Caddy redirect from `/` to `/.well-known/agent-card.json` so core-only deployments never return a bare 502 on the root path.

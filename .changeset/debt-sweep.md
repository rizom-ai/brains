---
"@brains/dashboard": patch
"@brains/deploy-support": patch
"@rizom/brain": patch
"@rizom/ops": patch
"@brains/atproto-contracts": patch
"@brains/web-chat": patch
---

Tech-debt sweep: dashboard CSS extracted to a real stylesheet; deploy scaffolding forks (push-target, run-subprocess, push-secrets, ssh-key-bootstrap) consolidated into @brains/deploy-support with drift-guard tests; atproto-contracts split into modules with the @brains/plugins dependency removed; hackmd, notion, plugin-examples, and mcp-bridge plugins deleted (zero consumers).

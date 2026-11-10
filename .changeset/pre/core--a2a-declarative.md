---
"@rizom/brain": patch
---

A2A is a declarative interface. It serves the same Agent Card, agent directory and JSON-RPC endpoint, registers `agent_call`, answers network asks and Studio calls, verifies and signs peer requests, and keeps the same public-ask allowance. A brain.yaml that still sets the removed `trustedTokens` or `outboundTokens` is refused with the same instruction, now reported as an invalid `a2a` config.

---
"@rizom/brain": patch
"@rizom/ops": patch
---

Align preview domain routing across deploy paths.

- Derive preview URLs consistently from the configured brain domain
- Support both `preview.<domain>` and `*-preview.*` preview host shapes in deploy Caddy templates
- Add regression coverage for preview URL derivation and preview host routing

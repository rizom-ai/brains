---
"@rizom/brain": patch
"@rizom/ops": patch
---

Fix deploy Caddy templates to match preview hosts reliably using a Host header regex that supports both `preview.<domain>` and `*-preview.*` host shapes.

Also remove the root-to-agent-card redirect from the generic site deploy templates so deployed site homepages continue serving the site root instead of redirecting to A2A discovery.

Add regression coverage for the generated Caddy templates in both the brain CLI and ops scaffolds.

---
"@rizom/brain": patch
---

Preserve stdin when launching the canonical minimal posture so its stdio MCP transport remains usable. Clear the Git sidecar shutdown timer after retirement so completed source-posture shutdown does not keep the CLI alive for the entire grace period. Keep the existing instance directory, no-orphans containment, grace deadline and process-group absence checks.

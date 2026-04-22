---
"@rizom/brain": patch
"@rizom/ops": patch
---

Fix published deploy scaffolding so both CLIs generate deploy files from the shared template source instead of stale package-local copies.

This keeps standalone and rover-pilot scaffolds aligned with the shared deploy templates, including the persistent runtime mounts for `/data`, `/config`, and `/app/dist`.

---
"@rizom/brain": patch
"@rizom/ops": patch
---

Converge the in-repo runtime and deploy path on the shared-host model: local app `src/site.ts` / `src/theme.css` conventions now resolve consistently in the monorepo runner, in-repo apps use the workspace `@rizom/brain`, and the legacy dedicated preview server on port `4321` is removed so preview stays on the shared HTTP host.

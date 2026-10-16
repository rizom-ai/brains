---
"@brains/deploy-support": patch
"@rizom/ops": patch
---

Require reviewed per-image runtime manifests and Bun lockfiles for new fleet image builds. Add a planning-only `images:lock` command, pin the selector-parser security fix in generated manifests, and install production dependencies frozen with lifecycle scripts disabled. Existing published images remain immutable; adopting the scaffold or preparing locks does not replace running containers.

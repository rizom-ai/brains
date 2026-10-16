---
"@rizom/brain": patch
---

Route `system_create` through plugin-owned create interceptors so core stays generic while entity plugins own create-time validation, rewriting, and specialized workflows.

Highlights:

- move link create/capture behavior out of `system_create` and into the link plugin
- move image target resolution/validation into the image plugin before generic create continues
- add framework support for registering create interceptors on entity types
- add regression coverage for core create interception, plugin registration, and framework plumbing
- fix eval bootstrap plugin resolution so plugin eval packages that export adapters alongside plugins load the actual plugin export

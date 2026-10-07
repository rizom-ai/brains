---
"@rizom/brain-ui": minor
---

Publish the shared Preact component library, moved from the private `@brains/ui-library` workspace. It carries no private-workspace dependencies: the blessed `z` is replaced by `zod` directly, `escapeHtml` is inlined, and `NavigationItem` now comes from `@rizom/site` where it originates. `preact` remains a peer dependency.

Named `@rizom/brain-ui` rather than `@rizom/ui`, which is already the Rizom brand primitives package.

Consumers should import from `@rizom/brain-ui`; `@brains/ui-library` no longer exists.

---
"@rizom/brain": patch
---

`@rizom/brain/model` and `@rizom/brain/plugins` compile without Node types. The model entry types the canonical definition as `CanonicalBrainDefinition` and its bundles as `CanonicalBundleDefinition`, so its declarations no longer carry the runtime's database or MCP server, and a tool's `annotations` use a restated `ToolAnnotations` instead of importing the MCP server SDK.

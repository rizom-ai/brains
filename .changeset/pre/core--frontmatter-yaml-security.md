---
"@rizom/brain": patch
"@brains/utils": patch
"@brains/entity-service": patch
---

Replace gray-matter's legacy YAML dependency chain with the existing maintained YAML 4 parser, removing sprintf-js from the runtime dependency graph. Preserve YAML/JSON frontmatter, existing octal/base-60 numeric meanings, custom fields, visibility handling, dates, binary values, and publishing-required colon-string quoting through an explicitly owned frontmatter schema.

Executable JavaScript frontmatter headers are now rejected, including empty executable-language blocks. Parsing is stateless, so document reads do not retain raw content or share mutable parsed objects. Regenerated YAML may use equivalent quoting or binary-tag notation; values and body text remain covered by old-reader round-trip controls.

This change does not ship downstream application overrides or establish published/deployed consumer adoption.

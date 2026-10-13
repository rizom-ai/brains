---
"@brains/core": minor
---

`system_update` can take a full replacement verbatim from the user's message: `source: { kind: "user-message", startAfter, endBefore, boundaryMode?, messageId? }`, the same source `system_create` accepts, as an alternative to `fields`, `content` or `edits` (exactly one of the four). The server reads the text from the stored message, so a large rewrite the user supplied is no longer re-typed by the model and cannot drift. The proposal shows the normal diff; approval replays the source pinned to its message and content hash, and fails if that message text changed instead of writing other text.

Replacement text without frontmatter, from `content` or `source`, now replaces the body and keeps the entity's stored frontmatter; text with frontmatter still replaces the whole document. Previously body-only text dropped a note's frontmatter and was rejected for types with structured frontmatter. Types without a body reject body-only text.

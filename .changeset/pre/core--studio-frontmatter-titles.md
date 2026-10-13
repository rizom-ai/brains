---
"@brains/studio": patch
---

Restore Studio list and editor titles by exposing the adapter-owned metadata title instead of deriving headings from stored Markdown. Prefer that projected title in the UI, retaining authored-frontmatter and durable-ID fallbacks. Studio no longer misinterprets YAML frontmatter as a heading; raw editor source and stored content remain unchanged.

---
"@rizom/brain": patch
---

Validate structured entity bodies on write. `StructuredContentFormatter` now parses and formats through a Zod codec, so `format` rejects data that violates the body schema instead of writing markdown that fails on the next read. Playbook optional text is a codec, so playbook bodies encode back to markdown.

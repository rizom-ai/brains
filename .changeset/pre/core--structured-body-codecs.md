---
"@rizom/brain": patch
---

Validate structured entity bodies on write. `StructuredContentFormatter` now parses and formats through a Zod codec, so `format` rejects data that violates the body schema instead of writing markdown that fails on the next read. Playbook optional text is a codec, so playbook bodies encode back to markdown.

Datasource-backed list and detail page templates (conversation summaries, decks, links, topics) no longer carry unused formatters that could not round-trip; they resolve from their data source only.

FAQ and conversation summary bodies are codecs too: writing an invalid FAQ body or summary entry fails at write time. Invalid stored summary entries fail validation rather than silently disappearing during export. Numeric arrays and absent optional collections retain their types and presence across the shared round-trip contract.

---
"@rizom/brain": patch
---

Validate structured entity bodies on write. `StructuredContentFormatter` now parses and formats through a Zod codec, so `format` rejects data that violates the body schema instead of writing markdown that fails on the next read. Playbook optional text is a codec, so playbook bodies encode back to markdown.

Datasource-backed list and detail page templates (conversation summaries, decks, links, topics) no longer carry unused formatters that could not round-trip; they resolve from their data source only.

FAQ and conversation summary bodies are codecs too: writing an invalid FAQ body or summary entry fails at write time. A summary entry that no longer satisfies the entry schema (for example a hand-edited time) is skipped when read, like any other unreadable section, so the rest of the summary still loads and can be rewritten.

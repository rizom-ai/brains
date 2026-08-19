---
"@brains/chat-repl": patch
---

Stop detecting job updates by sniffing emoji in rendered text.

The Ink app decided whether to coalesce a message by string-matching 🔄/✅/❌
and words like "completed" in already-rendered output — presentation used as a
control signal, broken by any glyph change. The interface knows which messages
are coordinator-initiated, so it now delivers them on a dedicated system
callback; replies always append, consecutive job updates coalesce in place, and
no text is inspected.

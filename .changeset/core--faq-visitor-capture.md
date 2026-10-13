---
"@rizom/brain": patch
---

FAQ capture now includes site visitors' questions. A reply to a visitor becomes a public draft FAQ for the owner to review, merges with the same question asked before, and counts toward how often it was asked; a visitor's own messages and refusals create nothing. The conversation service tells plugins about visitor messages on a new `conversation:guestMessageAdded` event that carries only where the message is, never its text, so no other plugin hears visitor conversations. The capture rewrite leaves out who asked and does not follow instructions inside the exchange.

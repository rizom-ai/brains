---
"@brains/seminar": patch
"@brains/a2a": patch
"@brains/contracts": patch
"@brains/content-formatters": patch
"@brains/faq": patch
"@rizom/brain": patch
---

A brain can hold a seminar: with the `seminar` capability added, the owner's `seminar_hold` tool puts one question to every approved peer at once and keeps each peer's answer verbatim, with the sources it returned, as a draft `seminar` the owner reads and publishes. A peer that does not answer is recorded with the reason. Turns reach peers through a new A2A turn contract, which sends the message as written, carries up to 32,000 characters and has its own budget, `turnTimeoutMs` (90 seconds by default).

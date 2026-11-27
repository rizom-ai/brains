---
"@brains/seminar": patch
"@brains/a2a": patch
"@brains/contracts": patch
"@brains/content-formatters": patch
"@brains/faq": patch
"@rizom/brain": patch
---

A brain can hold a seminar: with the `seminar` capability added, the owner's `seminar_hold` tool puts one question to every approved peer at once, the chair (the brain itself) reads their openings and decides whose stands, the others are asked to answer him from a work of their own, he answers them, and the chair closes with where they meet. Every peer's turn is kept verbatim, with the sources it returned, and every follow-up as the chair wrote it, as a draft `seminar`. Nobody edits a seminar: the owner reads it, redoes a draft from the chair's turn or from the closing (`seminar_hold` with `seminar` and `from`), and publishes it. A peer that does not answer is recorded with the reason. `plugins.seminar.guidance` tells the chair what it should know of its peers, such as the works a peer's brain does not hold. A site reads seminars through the `seminar:entities` data source. Turns reach peers through a new A2A turn contract, which sends the message as written, carries up to 32,000 characters and has its own budget, `turnTimeoutMs` (90 seconds by default).

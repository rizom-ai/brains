---
"@brains/plugins": patch
"@brains/sdk": patch
"@brains/decks": patch
"@brains/wishlist": patch
"@rizom/brain": patch
---

Explain service entity ownership at the point of a refused write and in the author guide; the golden service now declares and writes its own type. Make the in-memory harness decode adapter output like production reads, returning body content while retaining hashes of serialized markdown. Explicit whole-file codecs continue to retain frontmatter. The corrected harness exposed Deck and Wish decoders returning a body where their consumers require a complete file; retain their unindexed frontmatter on reads as their existing codecs already do on writes. No production storage format or existing stored data changes.

Export `SubscriptionDefinition` and `RequestContract` from the services and interfaces entries so response-bearing subscriptions can be exported with declaration emit enabled and requested from another package. Record both types in the stable export ledger and exercise this through the packed golden service and consumer.

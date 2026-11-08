---
"@rizom/brain": patch
---

The Ask copy entity type is a declarative definition built with `defineEntity`: the same singleton `ask-content` plugin, kept out of embeddings, storing the same markdown. Its copy (title, topics and the page copy around the conversation) is now its metadata, which startup re-derives for a copy written by an earlier release; web chat and the homepage opening read it either way. An Ask copy's markdown is built with `createAskContent`, which replaces the adapter the package exported.

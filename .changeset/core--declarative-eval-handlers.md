---
"@brains/plugins": minor
"@brains/sdk": minor
---

Add declarative eval handlers to the entity surface. An entity declares `evals` as named functions over the same narrowed context generation gets — AI, a logger contract, and entity access — and the runtime registers each with the eval namespace.

Nine entity packages currently register eval handlers by hand from `onRegister`, which is the largest remaining reason they extend `EntityPlugin`. The shared entity access gains `createEntity`, which eval handlers need and generation did not.

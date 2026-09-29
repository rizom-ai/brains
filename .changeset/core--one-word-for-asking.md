---
"@brains/plugins": minor
"@brains/sdk": minor
---

Asking the bus has one name: `request`

The same operation had two names. A service's publisher called it `send`, while
the reaction context and subscription handlers called it `request`. `send` reads
as fire-and-forget, which it is not: a subscriber answers, and a package that
believes otherwise drops the answer.

Every public surface now calls it `request` — services, subscription handlers,
and message interfaces — and `publish` remains the separate operation for
announcing to everyone listening. The shell's own messaging namespace is
untouched; this is the authoring vocabulary, not the bus.

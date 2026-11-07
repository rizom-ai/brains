---
"@brains/plugins": patch
"@rizom/brain": patch
---

`defineInterface` and `defineMessageInterface` take two arguments, as `defineServicePlugin` does: a header with the interface's `id`, `config`, `accountSettings`, `setup` and, for a message interface, its `channel`, and the behavior that reads the state `setup` returns, whose slots may be written in any order. A behavior slot written into the header, or a slot the interface does not have, is refused. `setup` is given `config`, `lifecycle.onCleanup` and `runtimeState({ namespace, schema })`, a store qualified by the owning package, so two packages declaring the same interface id never share a record. A message interface's cleanups also run when the queue worker shuts down, where its setup runs for delivery.

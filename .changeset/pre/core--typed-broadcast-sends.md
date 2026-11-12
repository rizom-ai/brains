---
"@rizom/brain": patch
---

Declared packages publish to a typed channel: `messaging.publish(channel, payload)`, with the channel declared once by `defineChannel(name, schema)`, which `@rizom/brain/services` and `@rizom/brain/entities` now export with its `Channel` type. The payload is typed by the channel, so a wrong one is a type error, and it is parsed by the channel's schema before it is sent; one the channel refuses throws and nobody hears it. The `publish({ topic, data })` form is removed.

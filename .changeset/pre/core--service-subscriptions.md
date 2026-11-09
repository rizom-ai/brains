---
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

A service answers other packages over the bus by contract. `defineBusContract({ channel, request, response, delivery })` is public from `@rizom/brain/services`, the brain's own contract narrowed to `request` and `command`; gathering stays inside the brain. The `subscriptions` slot returns `answer(contract, handler)` bindings, contract first, whose handler gets the parsed `request`, the `sender` and `entities` acting as the package; an answer keeps the literals it is written with, is checked against the response schema, and is released when the package shuts down. A channel answered twice, or a contract delivered any other way, is refused. The `tools` and `subscriptions` slots, and a job's handler beside `publish`, ask with `messaging.request(contract, request)`, which returns a `BusResult` whose failure is in its public form, and send with `messaging.command(contract, request)`. `BusContract` and `BusResult` are public types.

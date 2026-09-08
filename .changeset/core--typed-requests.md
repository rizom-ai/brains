---
"@brains/plugins": minor
"@brains/sdk": minor
---

A request can declare the shape of its answer

Asking over the bus came back as `unknown`, so the asking package parsed twice —
once for the envelope, once for the answer inside it — and mapped every failure
to the same shrug. Both sides already shared the topic and the schemas; nothing
let them share the fact that they belong together.

A `RequestContract` names a topic, what goes out, and what comes back.
`defineSubscription` may carry the response it answers with, and the runtime
checks the handler against it rather than trusting it. An asker passing the same
contract to `request` gets `{ ok: true, data }` with the parsed answer, or
`{ ok: false, code }` naming why there is none: `no_handler`, `handler_failed`,
or `invalid_response`. A refusal the answering package meant to give is still a
successful answer whose data says so.

The contract is a plain shape, so the package that owns a question can declare
one without importing the authoring runtime — which is how a shared contracts
package holds the ones two packages both use.

The test double also stopped lying: an unheard request answered `{ success: true
}` where the real bus answers a failure with a code, so a package could pass its
tests and read an empty answer in production.

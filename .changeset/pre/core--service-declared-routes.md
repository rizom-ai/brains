---
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

A service serves HTTP routes. The `routes` slot returns routes declared with `defineRoute` and `protocol`, now also exported from `@rizom/brain/services`, and is given `entities`, `jobs` and `messaging`, which inside a route act as its caller: the signed caller of a protocol route, or nobody in particular on a public one, and a job a route starts is admitted as that caller. Services and interfaces serve declared routes through one runtime, which answers a failure in its public form, `{ error, code }`, with the status its code names: `unauthenticated` (401) for an unsigned protocol call, `invalid_input` (400) for a body that is not JSON or that its schema refuses, a handler's `SdkError` with its own code, `handler_failed` (500) for any other error and `invalid_response` (500) for an answer outside the response schema. The diagnostic stays in the declaring package's log.

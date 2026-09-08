---
"@brains/sdk": minor
"@brains/plugins": patch
---

One shape for asking anything in a test

A tool called through the test harness threw on refusal while a bus request
answered with `{ ok: false, code }`: two mental models for one act. A tool
answers the way a request does now — `{ ok: true, data }` or `{ ok: false,
error }` — so a test asks a tool and asks over the bus with one shape.

The route answer type now records every shape tried for the literal-response
papercut, so the one remaining `as const` is a documented boundary rather than
an open question. And the guide says why a definition is two objects: what a
package is, then what it does, which is the split a brain makes when it boots.

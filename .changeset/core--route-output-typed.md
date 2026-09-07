---
"@brains/plugins": patch
---

A route's answer is typed by the schema it declared

`RouteOutput` resolved to `unknown` for every schema response, so a handler
could answer `{ count: "wrong" }` against `response: z.object({ count:
z.number() })` and compile. The runtime parsed it and failed at request time.

The handler's return is now the response schema's input, which is what the
runtime parses, so a schema that transforms takes the value going in. A route
declaring a literal or an enum response needs `as const` on that field or an
annotated handler return; the type's documentation says so, and the compile
fixture covers wrong shapes, missing fields, transforms, and verbatim routes.

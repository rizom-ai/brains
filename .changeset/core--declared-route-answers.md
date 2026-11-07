---
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

A declared route's handler answers with its response schema's input, for a service's routes and an interface's alike: written inline, an answer keeps its literal types, so an enum value needs no cast, and an answer the schema does not accept is refused by the types as well as by the runtime. `@rizom/brain/interfaces` exports `SdkError`, so an interface route throws a coded failure that is answered in its public form, `{ error, code }`, with the status its code names.

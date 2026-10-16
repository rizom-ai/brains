---
"@brains/ai-service": patch
"@brains/auth-service": patch
"@brains/site-engine": patch
"@brains/core": patch
"@brains/job-queue": patch
---

Collapse the remaining duplicate type declarations onto their canonical homes.

- The `JsonValue`/`JsonObject` family was declared independently in ai-service,
  auth-service, and site-engine; all three now use `@brains/contracts`, whose
  copy is the tested one (the published-SDK copy keeps its parity guard).
- `@brains/core` exported `SerializableEntity`, its schema, and the identity
  alias `SerializableQueryResult` with zero consumers anywhere — deleted.
- job-queue declared `JobProgressEvent` twice: a 30-line hand-written interface
  in `schemas.ts` and a `z.output` alias in the progress monitor. The schema is
  now the single source; the public type derives from it.

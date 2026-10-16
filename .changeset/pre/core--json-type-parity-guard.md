---
"@brains/contracts": patch
---

Pin the published copy of the JSON type machinery to the canonical one.

`@rizom/site` is published and may not depend on private `@brains/*` packages,
so it carries its own copy of `JsonValue`, `JsonObject`, `IsJsonValue`, and
`JsonObjectOutputGuard` — 54 lines of recursive conditional types including a
depth cap. The copy is deliberate; nothing held the two together, and only the
`@brains/contracts` side had tests.

A typecheck-time parity assertion now fails the build if either side gains,
loses, or reshapes a member, which is the same guarantee the deploy scripts get
from their generator plus drift test.

---
"@rizom/brain": patch
---

A first-party service package converted from a class keeps the plugin dependencies its class declared: it registers after them and does not start without them. Only the canonical brain's composer names them; a package that is not a service is refused.

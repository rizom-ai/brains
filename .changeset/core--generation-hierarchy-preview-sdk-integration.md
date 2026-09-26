---
"@rizom/brain": patch
"@brains/sdk": patch
"@brains/plugins": patch
"@brains/entity-service": patch
"@brains/http-host": patch
"@brains/studio": patch
"@brains/web-chat": patch
"@brains/site-content": patch
"@brains/note": patch
"@brains/site-professional": patch
---

Integrate main's content generation, structured entity destinations and hierarchy,
Note title projections, and operator-authorized preview guest access through the
declarative SDK. Preserve canonical metadata, package write ownership, caller
binding, cancellation, sanitized stream failures, and owner-qualified state.

Site Content uses shared durable generation instead of a separate fill-section
job. Explicit operator destinations are create-if-absent. Preserve Studio's
bounded searches and adapter-owned display titles alongside folder navigation.
The bundled professional site imports shared tag styling through public Brain UI.
Host-page markers survive independent SDK bundles instead of relying on constructor identity.

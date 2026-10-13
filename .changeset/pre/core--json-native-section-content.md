---
"@rizom/brain": patch
---

Fix site sections rendering empty when a query omits an optional value. Section content must be a JSON document, but the requirement was enforced only at the end of the build pipeline, so a schema declaring `.optional()` produced an explicitly-`undefined` property that the gate rejected by dropping the section with a warning. The blog and agent-discovery datasources returned `baseUrl: query.baseUrl`, and no first-party site sets `baseUrl`, so `writing/essays` and `network/directory` rendered empty on every build.

Section and template schemas now model absence as `null`, template and datasource output is bound to JSON-object types so a non-JSON schema fails to typecheck, and the frontmatter writer drops `null` alongside `undefined` so authored markdown still round-trips as written.

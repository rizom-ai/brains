---
"@rizom/site": minor
---

Require rendered section schemas to produce JSON-native object content. Optional section fields must normalize absence to `null`; schemas that emit `undefined`, primitives, functions, or other non-JSON values now fail typechecking.

Export shared JSON document types from `@rizom/site` for site-authoring contracts.

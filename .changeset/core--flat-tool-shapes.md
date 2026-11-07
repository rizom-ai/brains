---
"@rizom/brain": minor
---

`system_create` takes an upload's id in the source itself: `source: { kind: "upload", id, transform }`, and each file of a save of several uploads is `{ id, transform }`; the nested `upload: { kind: "upload", id }` object is removed. A `system_update` operation is named by the one field it carries: `{ fields }`, `{ content }`, `{ edits }` or `{ source }`, without a `kind`; a second field or a `kind` is rejected. Direct callers and MCP clients send the new shapes.

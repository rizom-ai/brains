---
"@brains/directory-sync": patch
---

Export updates to non-public entities again. The `entity:updated` auto-export subscriber re-read the entity without a visibility scope, and entity reads fail closed to public-only, so every `shared` or `restricted` entity came back null and was silently skipped — the file was never rewritten and the debounced git auto-commit found a clean tree. Creation was unaffected because it writes the event payload directly, so content repos only ever received added files, never modifications. The read now opts up through `internalFullScope`, matching the export pipeline and both import-side reads.

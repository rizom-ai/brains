---
"@brains/plugins": minor
"@brains/sdk": minor
"@rizom/brain": minor
---

Separate package-owned state for unscoped package names and scoped names containing
dots. These previously collided with ordinary scoped names or with a different
owner/namespace split. Use a tagged owner encoding for those names, while keeping
the existing keys for ordinary `@scope/name` packages unchanged.

Existing ambiguous rows are not copied, renamed, deleted, or used as a fallback:
the old collapsed key does not identify its owner. Installations that used affected
package names must review ownership before migrating their old state. All current
workspace package names retain their existing keys.

Add isolated public source/built/packed consumer coverage and real SQLite restart
regressions for collision separation, unchanged existing keys, and leaving
ambiguous old rows untouched.

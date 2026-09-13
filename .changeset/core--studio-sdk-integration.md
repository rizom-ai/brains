---
"@rizom/brain-ui": patch
"@brains/operator-view-react": patch
"@brains/admin": patch
"@brains/studio": patch
"@rizom/brain": patch
---

Integrate shared Studio presentation with the public SDK boundaries. Ship Brain UI as compiled JavaScript and bundled declarations without private runtime dependencies, retain CardHeader through the shared panel header, and expose the immutable widget stylesheet for standalone hosts. Preserve invitation selection and deep links in the declarative Administration workspace. Compile shared presentation assets into caller-owned staging directories so custom UI builds do not rewrite dependency-owned assets.

---
"@rizom/brain": patch
---

Retain server source maps in `dist/server-source-maps` for explicit debugger or offline symbolication use, rather than letting Bun automatically load them into each runtime process. Preserve source paths, embedded source content and debug identifiers. Browser maps remain linked and unchanged.

---
"@rizom/brain": patch
---

The style guide entity type is a declarative definition built with `defineEntity`. It is the same singleton `style-guide` plugin, kept out of embeddings, storing the same markdown. Its structured guidance (name, messaging, voice, visual) is now its metadata, which startup re-derives for a guide written by an earlier release. The neutral default guide is planted once startup content has settled: after a successful initial sync, as before, and also at boot when the brain has no initial sync pending, never after a failed one. A style guide's markdown is built with `createStyleGuideContent`, which replaces the adapter the package exported.

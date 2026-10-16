---
"@rizom/brain": patch
---

Keep PDF.js external to the CLI and server-library bundles and declare it as a CLI runtime dependency. This preserves PDF.js's package-relative worker and native canvas dependency resolution instead of relocating its entry without those assets.

Add a clean packed-consumer regression that verifies both bundle paths retain the external import and extracts text twice through the installed dependency without worker overrides or workspace fallback. Keep existing dependency versions and extraction policies unchanged; the PDF.js version update remains separate. This does not establish rendering, cross-platform native support, network isolation or parser resource bounds.

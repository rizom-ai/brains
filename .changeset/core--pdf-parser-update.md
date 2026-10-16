---
"@rizom/brain": patch
---

Update PDF.js to 6.4.299 in the shared document extractor and the CLI runtime dependency, with its required optional canvas 1.0.10 packages. Preserve the external PDF.js packaging boundary so the installed dependency resolves its own worker and native support.

Cover sparse four-byte Unicode mappings, compressed text, page order, caller-byte preservation, existing byte/page limits and empty or malformed input. Extraction remains flat text per nonempty page, not structured Markdown or OCR. Input byte/page limits do not establish total parser memory, decompression, runtime or shutdown bounds. This update is not rendering acceptance, cross-platform native certification, network isolation or a clean security audit. No public release-version bump or hosted rollout is included.

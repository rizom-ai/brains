---
"@brains/core": patch
---

Save pasted content through a `system_create` user-message source reference instead of making the model reproduce the body. Resolve exact, unique text boundaries in the stored conversation, preserve the selected source text, and bind confirmation to its message ID and content hash. Whole-line delimiter selection preserves intervening whitespace and LF/CRLF line endings, including final newlines. Reject ambiguous boundaries, inaccessible sources, and source changes after proposal. Existing entity visibility, canonical Markdown handling, and approval safeguards still apply.

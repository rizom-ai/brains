---
"@rizom/brain": patch
---

Every text type is held to one stored form by a contract test that runs each one through import, write-back, re-spacing, reordering and unknown keys against a golden file. A type whose header is strict (contact requests, quiz results, mail items, forms) refuses a file with a key it does not name instead of storing it without that key. The `writesInDocumentOrder` marker is gone: every type keeps the key order of the document it replaces. Codecs no longer trim their own body; the serializer frames every write, so a body that opens with an indented line keeps its indentation.

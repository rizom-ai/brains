---
"@brains/directory-sync": patch
---

Directory sync no longer re-imports a file that parses to exactly what is stored. A file not in canonical form, such as a note without a final newline, hashed differently from the stored row on every sync, so it was written again each time: its `updated` time moved to the file's modification time and an embedding job was queued, with no content change. On a copy of yeehaa.io this touched ten notes on every start.

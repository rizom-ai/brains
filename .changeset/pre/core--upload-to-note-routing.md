---
"@brains/core": patch
"@brains/ai-service": patch
"@brains/document-plugin": patch
"@brains/directory-sync": patch
"@rizom/brain": patch
---

The agent's tool choice holds on requests it used to settle by chance:

- An uploaded file the user asks to turn into a note is always extracted with system_create on the upload, transform extract-markdown, never generated from, however little text it holds; the document instructions say the same for uploaded PDFs.
- An upload saved without a title the user named takes the first heading of the file as its title, instead of a title guessed from its filename.
- A Trusted caller asked to delete refuses directly, without reading or searching for the target.
- A typed search that already returned the type's entities is not repeated with a lower minScore any more than with added words.
- A field the user did not state, such as the section of a doc, is left out for the tool to ask about, instead of filled in with a guess.
- directory_sync syncs only when the user asks to sync, refresh, pull, or back up the content directory, so saving an attached file never starts a sync; its status says when git is not configured.

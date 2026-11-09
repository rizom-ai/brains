---
"@rizom/brain": patch
---

The links are a declarative entity package, composed under their plugin id `link`. Their templates, `link:entities` data source, `link:capture` and `link:generation` jobs, eval and AT Protocol records are unchanged. A link reads back as its summary, with its frontmatter as its metadata, and is stored, imported and exported byte for byte as before; a hand-written link file keeps its own frontmatter order.

- **Capture:** a link is captured from the URL a request names, its URL alone included: a pending link first, then `link:capture`, attributed to the caller as data processing in their channel. The job's metadata now also records the interface it was requested from (`requestedByInterface`).
- **Full documents:** a full link document given as content that validates is saved as written, under its URL's slug. The link plugin class meant to save it that way, but on the brain's store its save never validated and fell back to a capture of the document's URL. A document that does not validate is still captured from its URL, as before, and so is one whose id is taken.
- **Visibility mismatch:** a link that exists at another visibility than asked is answered with a failed create, as before.

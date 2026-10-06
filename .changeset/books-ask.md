---
"@rizom/brain": patch
"@rizom/site-books": patch
"@rizom/theme-books": patch
---

Book brains can be asked about their work. The books site has an Ask page: the guest box under the site's name, a rail listing the passages an answer cites by siglum, book and year, each linked to its page, and a note when asking is not open. A section's reading page offers "Ask about AC-2", which starts the question with the siglum. Answers cite book sections only; a book's title entry, its contents, is never a source, and a cited entry is titled by its page title, so a section reads as its siglum. The book plugin tells the agent to search the books first, cite by siglum and book, quote the text verbatim and say when the books do not address a question. Core configures the entity links its answer sources read, so a site-builder bundled apart from core no longer leaves every source uncitable.

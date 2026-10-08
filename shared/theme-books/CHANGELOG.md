# @rizom/theme-books

## 0.2.0-alpha.1

### Minor Changes

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the reading site for book brains: `@rizom/site-books` (the bar with the brain's name and navigation, routes, arrow-key paging) and `@rizom/theme-books` (paper and ink with a red pencil, Didone display, a reading serif and typewriter sigla, dark mode). Book sections render as a reading page with their siglum and place in the book, spaced emphasis as letter-spacing, and their source; generated detail pages take their title from the entry.

### Patch Changes

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Book brains can be asked about their work. The books site has an Ask page: the guest box under the site's name, a rail listing the passages an answer cites by siglum, book and year, each linked to its page, and a note when asking is not open. A section's reading page offers "Ask about AC-2", which starts the question with the siglum. Answers cite book sections only; a book's title entry, its contents, is never a source, and a cited entry is titled by its page title, so a section reads as its siglum. The book plugin tells the agent to search the books first, cite by siglum and book, quote the text verbatim and say when the books do not address a question. Core configures the entity links its answer sources read, so a site-builder bundled apart from core no longer leaves every source uncitable.

# @rizom/site-books

## 0.2.0-alpha.1

### Minor Changes

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the reading site for book brains: `@rizom/site-books` (the bar with the brain's name and navigation, routes, arrow-key paging) and `@rizom/theme-books` (paper and ink with a red pencil, Didone display, a reading serif and typewriter sigla, dark mode). Book sections render as a reading page with their siglum and place in the book, spaced emphasis as letter-spacing, and their source; generated detail pages take their title from the entry.

### Patch Changes

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Book brains can be asked about their work. The books site has an Ask page: the guest box under the site's name, a rail listing the passages an answer cites by siglum, book and year, each linked to its page, and a note when asking is not open. A section's reading page offers "Ask about AC-2", which starts the question with the siglum. Answers cite book sections only; a book's title entry, its contents, is never a source, and a cited entry is titled by its page title, so a section reads as its siglum. The book plugin tells the agent to search the books first, cite by siglum and book, quote the text verbatim and say when the books do not address a question. Core configures the entity links its answer sources read, so a site-builder bundled apart from core no longer leaves every source uncitable.

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Book brains open on the work as one horizon: each book a spine at its year, as tall as its text, published works above the line and posthumous writings below, busy years widening so nothing overlaps; small screens get a year list. A book's title entry records whether it was published in the author's lifetime, its length, its section count and a short spine title. The books site's navigation wraps on narrow screens.

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A site can render an entity type's pages with a template of its choosing through `entityDisplay.<type>.detailTemplate`. The books site renders topics as theme pages: the theme's summary, a strand showing how many sections of each book stand close to it by year, and its closest passages, all found by stored embeddings without API calls. A section split across several entries counts once. Plugins share one related-entries lookup over stored embeddings, `findRelatedEntities`. Detail pages fall back to the title in an entry's frontmatter before naming it by type and slug. Book pages count one book or section in the singular.

- Updated dependencies [[`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c)]:
  - @rizom/site@0.2.0-alpha.239

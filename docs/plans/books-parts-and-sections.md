# Plan: Books, parts and sections

## Status

Proposed.

## Problem

Verified against `friedrich` and the code on main:

1. **One siglum is one book.** `packages/book-import/manifests/nietzsche.yaml` lists a book per eKGWB siglum, so works printed under one title in several parts are several books: _Also sprach Zarathustra_ I–IV (`Za-I`…`Za-IV`), _Menschliches, Allzumenschliches_ I–II (`MA-I`, `MA-II`) and the four _Unzeitgemässe Betrachtungen_ (`DS`, `HL`, `SE`, `WB`). The site shows 33 books.
2. **A book and its sections are one entity type.** The importer writes a book's title entry (order 0) and each of its sections as `book` entities. Every entity count reads them together: the dashboard shows 3,738 "Books" for 33 books and 3,705 sections, and search scopes, Studio and the agent see sections as books.

## Rule

One book per title as printed, with its parts as printed. A work whose title page names it a numbered part of a larger title — _Also sprach Zarathustra. Erster Theil_, _Unzeitgemässe Betrachtungen. Erstes Stück_, _Menschliches, Allzumenschliches. Zweiter Band_ — is a part of that book. The rule is read off the title pages, so it applies to every author without case-by-case calls.

## Design

1. **Manifest parts.** A manifest book lists either one `siglum` or `parts`: an ordered list of `{ siglum, title }`. The importer reads each part's siglum as it does a book today and joins them in manifest order into one book, numbering its entries across the parts.
2. **Part headings.** Each unit of a part gets the part's title as its outermost parent, so `part` (the outermost parent) is the manifest part: "Zweiter Theil", "II. Vom Nutzen und Nachtheil der Historie für das Leben". A siglum's own top-level divisions — _Menschliches, Allzumenschliches_ II's _Vermischte Meinungen und Sprüche_ and _Der Wanderer und sein Schatten_ — become the next level of parents and stay in the folder structure. Citations are unchanged: each section keeps its eKGWB siglum (`Za-II-Tugendhaften`, `HL-3`).
3. **Two entity types.** `book` is the work: title, author, year, kind, edition, license, attribution, published, length, section count, short title, and its contents. `book-section` is the text unit: title, book, order, siglum, page, part, source. The importer writes `book/<slug>.md` and `book-section/<slug>/…`. The section count, length and contents live on the book only.
4. **Consumers follow the split.** The book plugin registers both types. The book and theme datasources read sections as `book-section` and the book as `book`; the Ask scope searches `book-section`; theme tracing (`findRelatedEntities`) traces `book-section`; the site's book list reads `book` and its section pages `book-section`. Embeddings cover sections, as they do today.
5. **Friedrich's corpus is regenerated** from the manifest with parts: 26 books (Zarathustra one book of four parts, _Menschliches, Allzumenschliches_ one of two volumes, the _Unzeitgemässe Betrachtungen_ one of four pieces) and 3,705 sections. URLs change with the slugs; `friedrich` launched on 2026-10-08 and keeps no redirects.

## Phases

### Phase 1 — books of several parts

- tests first: a manifest book with `parts` imports one book whose entries are numbered across its parts in manifest order; each unit's outermost parent is its part's title; a siglum's own divisions follow it; citations keep their siglum; the contents group by part
- manifest schema and importer as above; `nietzsche.yaml` joins `Za-I`…`Za-IV`, `MA-I`/`MA-II` and `DS`/`HL`/`SE`/`WB`
- regenerate Friedrich's corpus from the content repo itself (`--from-corpus`, which reads a rendered book back into the units it was rendered from) and replace its `book/` tree; verify locally (26 books, the parts in each contents, a section page, a cited answer); release; redeploy `friedrich`

### Phase 2 — books and sections as two types

- tests first: the importer writes a `book` per work and a `book-section` per section; a section carries its full heading path, so the corpus reader reads every level back; the book plugin registers both; the book page lists its sections by part; a section page shows its book and part; Ask searches sections and cites book and siglum; a theme traces sections across books; entity counts read 26 books and 3,705 sections
- implementation as above
- regenerate Friedrich's corpus in the new layout, replace the content repo tree; verify locally; release; redeploy `friedrich`; the dashboard reads 26 books and 3,705 sections

## Decisions

- **The title page decides, not publication history.** The _Unzeitgemässe Betrachtungen_ were published separately, as were Zarathustra's parts; both name themselves numbered parts of one title.
- **One level of part in the reading interface.** The contents group by the outermost part; deeper divisions keep their folders and headings.
- **No redirects for the old URLs.** The site launched the day the problem was found.

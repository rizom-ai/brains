# Plan: Books — Friedrich, Karl, Sigmund

## Status

In progress. Phase 1 and the reading site are built (PRs #519–#537). Friedrich's published works are imported and staged in a local content repo, rehearsed locally on the full corpus; Phase 2's rollout waits on the first release containing `@brains/book`.

## Goal

A `book` plugin, and three fleet brains each holding one author's works in German as read-only books:

| Brain       | Author              | Domain               | Content repo                       |
| ----------- | ------------------- | -------------------- | ---------------------------------- |
| `friedrich` | Friedrich Nietzsche | `friedrich.rizom.ai` | `rizom-ai/rover-friedrich-content` |
| `karl`      | Karl Marx           | `karl.rizom.ai`      | `rizom-ai/rover-karl-content`      |
| `sigmund`   | Sigmund Freud       | `sigmund.rizom.ai`   | `rizom-ai/rover-sigmund-content`   |

Asking a brain about an idea returns an answer grounded in book sections, quoting the German original with book, section and edition.

## Non-goals

- No Ask before its slice; the reading site ships slice by slice.
- No Studio changes; books use Studio's existing id-path folders.
- No translations produced by the brain; books hold only published German texts.
- No letters written _to_ the author.

## The `book` plugin

`entities/book` (`@brains/book`), two entity types — `book` (the work) and `book-section` (its text) — catalog member `book` in `packages/brain-cli/src/model/canonical-brain.ts`, selected per brain with `add: [book]`.

It follows the domain-plugin model in `docs/architecture-overview.md` (multi-target content generation): a section's place in its book is the entity's structured id path, encoded by the shared entity-path codec, exactly as `site-content` maps route › section. No book concept enters the shell.

### Id path

- `brain-data/book/<book>.md` → id `<book>`: the book's details and table of contents.
- `brain-data/book/<book>/<nnnnn>-<slug>.md` → a `book-section` with id `<book>:<nnnnn>-<slug>`: sections are contained in their book, so they live in its folder; headings become folders named after the order of their first section, e.g. `traumdeutung:00412-die-traumarbeit:00415-die-darstellungsmittel-des-traums`. `<nnnnn>` is five-digit reading order within the book, from 1, so id order is reading order.

### Frontmatter

A book:

- `title`, `source`
- `author`, `year`, `kind` (`work` | `nachlass` | `letters` | `excerpt`)
- `edition`, `license` (`public-domain` | `CC-BY-SA-4.0` | `CC-BY-NC-ND-4.0`), `attribution`
- `published` (in the author's lifetime, private prints included), `length` (bytes of its sections' text), `sections`, `shortTitle` (for the spine)

A section:

- `title` — section heading
- `book` — the book's slug
- `order` — reading order within the book, from 1
- `section` — the author's or edition's own citation unit where it exists (aphorism number, `§`, eKGWB siglum such as `FW-125`), else null
- `page` — source page reference, else null
- `headings` — the headings the section stands under, outermost first: a book's part, then the division within it
- `source` — URL of the source for this section

Body: the author's text, unchanged except for markdown conversion.

### Splitting rule

1. one section per author's or edition's unit: aphorism, `§`, siglum, chapter or subsection, letter;
2. a unit over 8,000 UTF-8 bytes splits at paragraph boundaries into consecutive sections with the same `title` and `section`;
3. two units are never merged.

8,000 bytes keeps each section inside one embedding input (`MAX_INPUT_TOKENS` in `shell/ai-service/src/online-embedding-provider.ts`), so every section has its own vector and a search hit is the text to quote.

### Reading on a site

The plugin ships `book-list`, `book-detail` and `book-section-detail` templates and a `book:entities` datasource. Generated routes: `/books` lists books; `/books/<book>` is a book's title page with the score of its sections; `/books/<book>/<order>` is a section with its citation, source attribution and prev/next in reading order. Every section carries `book`, `order` and a derived `slug` in metadata, so each page is a handful of indexed lookups regardless of book length. The site serving books sets `entityDisplay.book.paginate: false`, since the index lists books, and gives `book-section` the plural `books` so sections open under their book; `book-section` has no list template, so it gets detail routes only.

### Reading site

Book brains get a purpose-built reading site, not the default site with books added. Mockup: [friedrich-reading-site-mockups.html](../friedrich-reading-site-mockups.html) — the work as one horizon of spines (height = measured length, published above the line, posthumous below), a book as a score of its sections, a section page cited by siglum with Sperrsatz emphasis and themes in the margin, a theme traced across the works, Frag Friedrich with cited answers, and phone layouts.

Interface in English; texts, quotes, titles, sigla and Nietzsche's own terms stay German (`lang="de"`). The pages live in `@brains/book`'s own templates, so every book brain gets them: `book-list` is the horizon, `book-detail` a book's score, `book-section-detail` the reading page. `@rizom/site-books` supplies layout, routes (`/` is the horizon) and `entityDisplay`; `@rizom/theme-books` supplies fonts, paper/ink/red-pencil tokens and dark mode.

Topics are named in the author's own terms: each book brain's content carries a `prompt` entry targeting `topics:extraction` that asks for the author's concepts in the source language (Mitleid, Ressentiment, Wille zur Macht), at the level of a concept, and no topic named after the author or a whole book's subject. A section's margin lists its nearest topics by stored embedding; a topic's page is its theme traced across the books (the site renders `topic` with `book:theme` through `entityDisplay.topic.detailTemplate`). Both read related sections with `nearestToEntity`, one store query by cosine distance from a stored vector, so a full build stays linear: Nietzsche's 3,705 sections build in about a minute and a half.

Ask lives at `/ask` (`book:ask`): the guest box under the site's name, and a rail listing the passages an answer cites by siglum, book and year. A reading page offers "Ask about AC-2", which starts the question with the siglum. The books site marks only `book-section` citable, so a book's contents are never a source; a cited section is titled by its siglum (`pageTitle`). The book plugin's instructions tell the agent to search the sections first, cite by siglum and book, quote verbatim, and say when the books do not address a question. Turning Ask on for a deployed brain is the owner's budgeted switch in Studio.

### Entity type config

- Both types: `actionPolicy` `never` for create, update, delete, extract and publish — the agent reads and cites, never edits; the importer writes through directory-sync.
- `book-section`: `containedIn: "book"` — stored in its book's folder, shown under it in Studio, deleted with it. `projectionSourceRole: "canonical"` — a book brain's sections are its primary texts; its topics map their themes. `defaultSort`: `id` ascending — reading order for `system_list`.
- `book`: `projectionSource: false` — a book's contents are no text to extract topics from.

Action policy is enforced in the `system_*` tools, Studio and the operator surface, not in the entity service, so directory-sync writes books unhindered.

## Brain identity

Each brain gets an `anchor-profile` and a `brain-character`:

- name: Friedrich / Karl / Sigmund
- role: reading companion to the author's works
- instructions: answer from book sections found by search; quote the German original; cite book, section and edition; say when the books have nothing on a question; answer in the user's language; do not speak as the author in the first person.

## Sources

Allowed: public-domain texts, CC BY-SA 4.0, and Nietzsche Source's CC BY-NC-ND 4.0 for the non-commercial `friedrich` brain. Not used: Projekt Gutenberg-DE and Zeno.org (terms forbid bulk copying), mlwerke.de (offline), and any modern editorial apparatus, introduction or translation still in copyright.

### Friedrich

| Source                                          | Coverage                                                                        | License                     | Format              |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------- | ------------------- |
| eKGWB, nietzschesource.org                      | published works, Nachlass 1869–1889, Nietzsche's letters (Colli–Montinari text) | CC BY-NC-ND 4.0             | print page per book |
| Deutsches Textarchiv                            | Homer, Idyllen aus Messina (first editions)                                     | CC BY-SA 4.0                | TEI                 |
| archive.org, Großoktavausgabe (1894–1926) scans | Philologica                                                                     | public domain (author text) | OCR                 |

eKGWB terms: attribution with URL on every entry (`source`), no commercial use, text unchanged. Every eKGWB unit is addressed by its siglum (`/eKGWB/<siglum>`), which becomes `section`.
Fetching: the importer requests each book's print page (`/eKGWB/<book>/print`) once, at most one request per second, caches every response and never refetches, and identifies itself with a User-Agent carrying a contact address. The operator has told Nietzsche Source about the import.
Not covered: Juvenilia, letters to Nietzsche.

### Karl

| Source                                                 | Coverage                                                                                                                                                                                             | License                       | Format      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------- |
| MEGAdigital (`megadigital.bbaw.de/api/v2/tei-xml.xql`) | Kapital and drafts (MEGA² II), letters 1866–1871, excerpt volumes                                                                                                                                    | CC BY-SA 4.0 (per TEI header) | TEI         |
| Deutsches Textarchiv                                   | Kapital I–III, Achtzehnte Brumaire, Manifest                                                                                                                                                         | CC BY-SA 4.0                  | TEI         |
| archive.org scans                                      | Theorien über den Mehrwert (1905–10), Aus dem literarischen Nachlass (Mehring 1902), Gesammelte Schriften 1852–1862 (Rjasanoff 1917, Luise Kautsky's translations), Das Elend der Philosophie (1885) | public domain                 | OCR         |
| de.wikisource                                          | Zur Judenfrage, Thesen über Feuerbach, Kritik des Hegelschen Staatsrechts                                                                                                                            | public domain                 | wiki markup |
| gutenberg.org                                          | Briefwechsel Marx–Engels vol. 1 (1913)                                                                                                                                                               | public domain                 | text        |

Joint works with Engels are included; Engels-only works are not.
Not covered: English and French writings with no public-domain German translation, letters before 1866 and after 1871, Grundrisse, Ökonomisch-philosophische Manuskripte and Deutsche Ideologie until an open transcription is found.

### Sigmund

| Source                                                                          | Coverage                     | License                                             | Format          |
| ------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------- | --------------- |
| archive.org, Gesammelte Werke I–XVII (Imago, London 1940–52), `freud-YYYY-gw-N` | all works                    | public domain (author †1939; edition past §70 UrhG) | OCR text + hOCR |
| Deutsches Textarchiv                                                            | Studien über Hysterie (1895) | CC BY-SA 4.0                                        | TEI             |

Strip: editors' prefaces and notes.
Not covered: letters, Nachtragsband, index volume.

### OCR quality gate

Every OCR volume is gated before import: 20 random pages checked against the scan, fewer than 1 wrong word per 200. A failing volume is re-OCRed from the scan images with Tesseract (`frk`/`deu_frak` for Fraktur, `deu` otherwise) and gated again; if it still fails it stays out and is listed as a gap.

### Coverage note

Each brain carries a `coverage` note listing every work in the author's oeuvre as `imported` (source, edition) or `gap` (reason). Asked about a gap, the brain says the work is not among its books.

## Importer: `packages/book-import`

Private workspace package, not published:

```sh
bun packages/book-import/src/cli.ts <manifest> <content-repo>/brain-data
```

- `manifests/{nietzsche,marx,freud}.yaml` — one entry per book: adapter, source, edition, license, strip rules
- adapters: `dta-tei`, `ekgwb`, `mega-tei`, `archive-ocr`, `gutenberg-text`, `wikisource`; each yields ordered units `{ path, title, section, page, source, paragraphs }`
- one shared writer applies the splitting rule, validates every entry against `@brains/book`'s schema, writes `book/<book>/…`, and removes stale entries of that book
- deterministic: rerunning on the same sources yields byte-identical files
- downloads are cached locally and never committed
- emphasis (Sperrsatz) becomes markdown emphasis; spans that touch in reading order merge, also across an editor's correction wrapped around a word, and space at a span's edge stays outside the markers
- file and entry slugs transliterate letters (ü → ue, ß → ss, é → e) instead of dropping them

Flow per book:

1. fetch into the cache, or fail with the URL;
2. parse with the adapter, failing on unknown structure;
3. strip editorial apparatus by the manifest's rules;
4. split and validate, failing on any invalid entry;
5. write the book's entries.

## Fleet setup (rover-pilot)

- cohort `cohorts/books.yaml`: `bundlesOverride: [core, web, chat]`, `addOverride: [book]`, members `friedrich`, `karl`, `sigmund`, `brainVersionOverride` = the first release containing `@brains/book`
- per brain: `bunx brains-ops user:add . <handle> --cohort books`, Discord disabled, setup email `yeehaa@rizom.ai`, `anchorProfile.name` set, then `secrets:encrypt` and `onboard` (creates the content repo)
- the importer's output is committed to the content repo; directory-sync pulls it

## Phases

Each phase ships on its own PR, tests first.

### Phase 1 — walking skeleton: Der Antichrist

- `@brains/book`: schema, adapter, entity type config; tests for schema, markdown round trip, id paths, action policy
- `book` catalog member
- `book-import` with the shared writer and the `ekgwb` adapter: eKGWB text endpoint and siglum list per book, polite fetch, attribution per entry; tests for splitting and determinism against recorded responses
- import Der Antichrist (`AC`) into a local test app from `packages/brain-cli`; verify Studio shows the book as a folder in reading order, `system_search` returns entries with book and siglum, and the agent cannot update or delete an entry

### Phase 2 — Friedrich: published works

- operator note to Nietzsche Source before the full fetch
- Nietzsche manifest for the published works and private prints; coverage note
- release, `books` cohort, `friedrich` user, content repo seeded, deploy
- verify `https://friedrich.rizom.ai/health/ready` is 200 and a chat question returns sections cited by siglum

### Phase 3 — Friedrich: Nachlass and letters

- full local import of the Nachlass fragments 1869–1889 and Nietzsche's letters: measure import time, index-readiness time and DB size; the readiness gate must clear before deploy
- content repo updated, deploy, same verification
- `dta-tei` and `archive-ocr` adapters with the OCR gate for Homer, Idyllen aus Messina and the Philologica

### Phase 4 — Sigmund

- apparatus stripping for `archive-ocr`; OCR gate on GW I–XVII; Freud manifest and coverage note
- `sigmund` user added, content repo seeded, deploy, same verification

### Phase 5 — Karl

- `mega-tei`, `gutenberg-text` and `wikisource` adapters; Marx manifest and coverage note
- `karl` user added, content repo seeded, deploy, same verification

## Risks

- **Scale.** Directory-sync stress was proven to 700 files; the Nachlass, Nietzsche's letters and Marx each run past 10,000 entries. Phase 3's full local import is the measurement before any of them ships.
- **OCR quality** of Fraktur scans: handled by the OCR gate; failing volumes become listed gaps.
- **"Complete" is bounded by licensing.** The coverage note shows what is missing and why.

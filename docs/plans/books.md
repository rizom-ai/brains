# Plan: Books — Friedrich, Karl, Sigmund

## Status

In progress. Phases 1, 2 and 5 are live: Friedrich's published works (26 books) at `friedrich.rizom.ai`, Karl (46 books, 4,167 entries, rover-pilot #181) at `karl.rizom.ai`. The brains now hold each author's published works only (see Goal): Friedrich’s content repo holds his 26 published works (the Nachlass and letters of Phase 3, #648, never reached it), and the letters and others’ translations come out of Karl. Sigmund's import is built (#538): 154 books from the Gesammelte Werke scans, the OCR checked against 20 Gutenberg transcriptions and corrected from them and from the scans; Phase 4's seeding and deploy are not started. Karl's import (#567), now 75 books, reads the Deutsches Textarchiv, Wikisource, MEGAdigital, mlwerke.de's captures, the Marx-Engels-Werke PDFs and archive.org's scans, Fraktur read anew with frak2021; his reseed waits on site builds fitting in memory.

## Goal

A `book` plugin, and three fleet brains each holding one author's published works as read-only books.

A published work is one the author published, or one published after his death from a manuscript he left as a work: Marx's Kapital II and III, the Grundrisse and Die deutsche Ideologie count; letters, notebooks, excerpts and Nachlass fragments do not. Each work is held in the language the author wrote it, or in a translation he made or revised himself. A brain is complete when every published work in the standard catalogue of the author's writings is imported or listed as a gap whose reason is checked: MEGA² for Marx, the Freud-Bibliographie for Freud, KGW for Nietzsche.

| Brain       | Author              | Domain               | Content repo                       |
| ----------- | ------------------- | -------------------- | ---------------------------------- |
| `friedrich` | Friedrich Nietzsche | `friedrich.rizom.ai` | `rizom-ai/rover-friedrich-content` |
| `karl`      | Karl Marx           | `karl.rizom.ai`      | `rizom-ai/rover-karl-content`      |
| `sigmund`   | Sigmund Freud       | `sigmund.rizom.ai`   | `rizom-ai/rover-sigmund-content`   |

Asking a brain about an idea returns an answer grounded in book sections, quoting the original with book, section and edition.

## Non-goals

- No Ask before its slice; the reading site ships slice by slice.
- No Studio changes; books use Studio's existing id-path folders.
- No translations produced by the brain, and none by others: books hold the author's own text.
- No letters, notebooks, excerpts or Nachlass fragments.

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

The plugin ships `book-list`, `book-detail` and `book-section-detail` templates and a `book:entities` datasource. Generated routes: `/books` lists books; `/books/<book>` is a book's title page with the score of its sections; `/books/<book>/<order>` is a section with its citation, source attribution and prev/next in reading order. Every section carries `book`, `order` and a derived `slug` (`bookSectionSlug(book, order)`) in metadata. A page finds its section and its neighbours by slug, through the entity store's index on type and slug, so each page is a handful of index lookups whatever the size of the book or the brain. A site build holds every page's data at once, so a page carries only what it shows (`schemas/book-pages.ts`): its section's text once, its neighbours as links, its book's fields without the book's text. The site serving books sets `entityDisplay.book.paginate: false`, since the index lists books, and gives `book-section` the plural `books` so sections open under their book; `book-section` has no list template, so it gets detail routes only.

### Reading site

Book brains get a purpose-built reading site, not the default site with books added. Mockup: [friedrich-reading-site-mockups.html](../friedrich-reading-site-mockups.html) — the work as one horizon of spines (height = measured length, published above the line, posthumous below), a book as a score of its sections, a section page cited by siglum with Sperrsatz emphasis and themes in the margin, a theme traced across the works, Frag Friedrich with cited answers, and phone layouts.

Interface in English; texts, quotes, titles, sigla and Nietzsche's own terms stay German (`lang="de"`). The pages live in `@brains/book`'s own templates, so every book brain gets them: `book-list` is the horizon, `book-detail` a book's score, `book-section-detail` the reading page. `@rizom/site-books` supplies layout, routes (`/` is the horizon) and `entityDisplay`; `@rizom/theme-books` supplies fonts, paper/ink/red-pencil tokens and dark mode.

Topics are the brain's interface to other brains: each is published as an `ai.rizom.brain.topic` record, and the brain's agent card derives its skills from their titles, which other brains match against when they look for expertise. A book brain's topics therefore use the default extraction prompt and name concepts in the network's shared language, so a brain asking about resentment finds Friedrich; the author's own terms (Mitleid, Ressentiment) belong to the reading pages, not to topic identity. A section's margin lists its nearest topics by stored embedding; a topic's page is its theme traced across the books (the site renders `topic` with `book:theme` through `entityDisplay.topic.detailTemplate`). Both read related sections with `nearestToEntity`, one store query by cosine distance from a stored vector to the entities of the requested type, which the same index finds, so a full build stays linear.

Ask lives at `/ask` (`book:ask`): the guest box under the site's name, and a rail listing the passages an answer cites by siglum, book and year. A reading page offers "Ask about AC-2", which starts the question with the siglum. The books site marks only `book-section` citable, so a book's contents are never a source; a cited section is titled by its siglum (`pageTitle`). The book plugin's instructions tell the agent to search the sections first, cite by siglum and book, quote verbatim, and say when the books do not address a question. Turning Ask on for a deployed brain is the owner's budgeted switch in Studio.

### Entity type config

- Both types: `actionPolicy` `never` for create, update, delete, extract and publish — the agent reads and cites, never edits; the importer writes through directory-sync.
- `book-section`: `containedIn: "book"` — stored in its book's folder, shown under it in Studio, deleted with it. `projectionSourceRole: "canonical"` — a book brain's sections are its primary texts; its topics map their themes. `defaultSort`: `id` ascending — reading order for `system_list`.
- `book`: `projectionSource: false` — a book's contents are no text to extract topics from.

Action policy is enforced in the `system_*` tools, Studio and the operator surface, not in the entity service, so directory-sync writes books unhindered.

## Brain identity

Each brain gets an `anchor-profile` and a `brain-character`:

- name: Friedrich / Karl / Sigmund
- role: the author, answering from his works
- instructions: speak as the author, in the first person and in his manner; claim only what the book sections found by search say; quote the German original; cite book, section and edition; say when the books have nothing on a question, never inventing what the author might have thought; answer in the user's language.

## Sources

Allowed: public-domain texts, CC BY-SA 4.0, and Nietzsche Source's CC BY-NC-ND 4.0 for the non-commercial `friedrich` brain. Not used: Projekt Gutenberg-DE and Zeno.org (terms forbid bulk copying), and any modern editorial apparatus, introduction or translation still in copyright. mlwerke.de's MEW transcriptions, now offline, are read from the Internet Archive's captures for works no early edition is available of; the MEW volumes (1956–1968) are past the 25-year edition right of §70 UrhG, and the Institut für Marxismus-Leninismus's introductions and notes are left out, the authors' own notes kept.

### Friedrich

| Source                                          | Coverage                                                             | License                     | Format              |
| ----------------------------------------------- | -------------------------------------------------------------------- | --------------------------- | ------------------- |
| eKGWB, nietzschesource.org                      | published works and finished posthumous works (Colli–Montinari text) | CC BY-NC-ND 4.0             | print page per book |
| Deutsches Textarchiv                            | Homer, Idyllen aus Messina (first editions)                          | CC BY-SA 4.0                | TEI                 |
| archive.org, Großoktavausgabe (1894–1926) scans | Philologica                                                          | public domain (author text) | OCR                 |

eKGWB terms: attribution with URL on every entry (`source`), no commercial use, text unchanged. Every eKGWB unit is addressed by its siglum (`/eKGWB/<siglum>`), which becomes `section`.
Fetching: the importer requests each print page (`/eKGWB/<siglum>/print`) once, at most one request per second, caches every response and never refetches, and identifies itself with a User-Agent carrying a contact address. The operator has told Nietzsche Source about the import.
Not covered: Juvenilia, the Nachlass fragments and Nietzsche's letters, which are not published works.

### Karl

| Source                                                                                                                                  | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | License                                             | Format        |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------- |
| MEGAdigital (`megadigital.bbaw.de/api/v2/tei-xml.xql`)                                                                                  | excerpt volumes (not imported: excerpts are not published works)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | CC BY-SA 4.0 (per TEI header)                       | TEI           |
| MEGAdigital Kapital section (`telota.bbaw.de/mega/docs`)                                                                                | Grundrisse with Einleitung and Bastiat und Carey (MEGA² II/1, 1976–81), Ökonomisches Manuskript 1863–65, Erstes and Zweites Buch (II/4.1, 1988)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | public domain (author text; edition past § 70 UrhG) | TEI           |
| Deutsches Textarchiv                                                                                                                    | Kapital I–III, Achtzehnte Brumaire, Manifest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | CC BY-SA 4.0                                        | TEI           |
| archive.org scans, read anew with Tesseract and UB Mannheim’s frak2021 Fraktur model where the archive’s OCR read Fraktur as roman type | Die Klassenkämpfe in Frankreich (1895), Theorien über den Mehrwert I–III (Kautsky, 1905–1910), Marx’s writings of 1841–1847 in Aus dem literarischen Nachlass I–II (Mehring 1902/1913), his articles of 1848–1850 in Nachlass III (the Neue Rheinische Zeitung and its Revue) and his German articles for the Neue Oder-Zeitung of 1855 in Gesammelte Schriften II (Rjasanoff 1917), without Luise Kautsky’s translations of his English articles; Engels’ articles left out by MECW’s attribution; Zur Kritik der politischen Oekonomie (1859); the Enthüllungen with Marx’s additions of 1875 and the Central Authority’s addresses of 1850 (Engels’ edition, 1885); Lohnarbeit und Kapital (Kautsky’s edition, 1908: Engels’ revision, Marx’s wording of 1849 in the notes); the critique of the Gotha programme (Die Neue Zeit, 1891)                                                                                                                                                                                                                                                                                                                                                                                                                                            | public domain                                       | OCR           |
| archive.org scan with the archive’s own OCR, the type being roman                                                                       | Ueber P.-J. Proudhon (Der Social-Demokrat, 1865, as reprinted in Das Elend der Philosophie, 1885), Value, Price and Profit (London 1899)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | public domain                                       | OCR + hOCR    |
| de.wikisource, fr.wikisource and en.wikisource                                                                                          | Zur Judenfrage, Zur Kritik der Hegel’schen Rechtsphilosophie. Einleitung, Marx’s letters in Ein Briefwechsel von 1843 (Deutsch-Französische Jahrbücher 1844), Thesen über Feuerbach (1888); Misère de la philosophie and the Discours sur la question du libre-échange (Paris 1896, after the editions of 1847 and 1848), Marx’s own notes kept and the publisher’s left out; Le Capital (Paris, Lachâtre, 1872–75), Roy’s translation as Marx revised it, with Marx’s letter to Lachâtre, his preface, Avis au lecteur and postface, its tables and formulas as text; The Civil War in France (London 1871, second edition, revised) with its notes, and the two addresses on the Franco-Prussian War (1870) in the only transcribed edition, the American of 1902, without its editor’s captions and notes; the Address and Provisional Rules of the International (London 1864, in the facsimile of 1924), its General Rules and Administrative Regulations and the London Conference’s resolutions (both London 1871); The Story of the Life of Lord Palmerston (London 1899, Eleanor Marx Aveling’s edition of the articles of 1853)                                                                                                                                            | public domain                                       | rendered HTML |
| Project Gutenberg (its HTML read as a transcription with printed pages)                                                                 | Secret Diplomatic History of the Eighteenth Century (London 1899), Marx’s Revelations of the Diplomatic History of the 18th Century in his English, with his notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | public domain                                       | rendered HTML |
| mlwerke.de (MEW, Dietz 1956–1968), from the Internet Archive's captures                                                                 | Kritik des Hegelschen Staatsrechts (MEW 1, 1976), Ökonomisch-philosophische Manuskripte (MEW 40, 1968), Herr Vogt (MEW 14, 1961), Die deutsche Ideologie (MEW 3, 1969), Inauguraladresse der Internationalen Arbeiter-Assoziation (MEW 16, 1975), Marx’s fifty German articles for the Vienna Presse (1861–62), his letter to the Berliner Reform and the London Workers’ Educational Society’s proclamation on Poland (1863) (MEW 15, each page an article titled by its own heading); his other German writings that no early edition holds, each MEW page an article: the articles of 1842–46 and of Brussels 1847–48 with the Forderungen der Kommunistischen Partei, the Zirkular gegen Kriege (1846), the Neue Rheinische Zeitung of 1848 and 1849 beyond Mehring’s selection (Engels’ articles left out by MECW’s attribution), the Revue of January/February 1850 and the Revue’s other pieces and declarations of 1849–52, Die großen Männer des Exils (1852), Hirschs Selbstbekenntnisse (1853), Der Ritter vom edelmütigen Bewußtsein (1854), the Neue Oder-Zeitung articles Rjasanoff left out (1855), the Volk articles and declarations on Vogt (1859–60), the articles and declarations of 1864–75, the prefaces of 1872–82 and Marx’s chapter of Anti-Dühring (1878) | public domain (author text; edition past §70 UrhG)  | rendered HTML |

Joint works with Engels are included; Engels-only works are not.
Not covered, as the coverage note lists them: Marx's letters, which are not published works; MEGA² volumes still within the edition right (II/4.3, II/11–13), and II/4.2 until its print date is confirmed, since its transcription carries II/4.3's header. Imported in Marx's English: Value, Price and Profit (London 1899, the 1898 text); The Civil War in France (1871), replacing Engels' translation, and the two addresses on the Franco-Prussian War (1870), the Secret Diplomatic History (1856–57), the Story of the Life of Lord Palmerston (1853) and the International’s Address and Provisional Rules (1864), General Rules (1871) and Conference resolutions (1871); in his French: Misère de la philosophie (1847) and the Discours sur la question du libre-échange (1848), replacing Bernstein and Kautsky's translations. Not held, as others' translations do not count: his English articles for the New-York Tribune and the People's Paper (1852–62), whose only complete source, the Library of Congress's newspaper scans, refuses scripted access. Imported besides, as Marx revised it: Le Capital (1872–75). Karl's coverage is audited against MEGA² for the rest.

### Sigmund

| Source                                                                          | Coverage                     | License                                             | Format          |
| ------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------- | --------------- |
| archive.org, Gesammelte Werke I–XVII (Imago, London 1940–52), `freud-YYYY-gw-N` | all works                    | public domain (author †1939; edition past §70 UrhG) | OCR text + hOCR |
| Deutsches Textarchiv                                                            | Studien über Hysterie (1895) | CC BY-SA 4.0                                        | TEI             |

Strip: editors' prefaces and notes.
Not covered: letters, index volume. The Nachtragsband (1987) holds published writings the Gesammelte Werke left out; it is audited against the Freud-Bibliographie with the rest.

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
- adapters: `ekgwb`, `archive-ocr`, `dta-tei`, `mega-etx` (both on a shared TEI reader), `wikisource` (also reading Project Gutenberg ebooks), `mlwerke`; each yields ordered units `{ path, title, section, page, source, paragraphs }`
- one shared writer applies the splitting rule, validates every entry against `@brains/book`'s schema, writes `book/<book>/…`, and removes stale entries of that book
- deterministic: rerunning on the same sources yields byte-identical files
- downloads are cached locally and never committed
- a scanned book may name an OCR model (`ocr: frak2021`): its page images are read anew with Tesseract after ImageMagick doubles them in grey, both on the path, each page recognised once into the cache; its OCR is checked against transcriptions of any edition (`references`), whose spelling is mapped to the edition’s before a fix is made
- a scanned book leaves out notes not the author’s, by page and opening words (`skipNotes`) or by the editor’s signature (`skipNotesSigned: [K.]`); an edition that sets its notes as large as the text, below a rule the OCR does not read, says so (`spacedNotes`); a page the OCR set too askew to tell paragraphs by their indent names the lines that open them (`paragraphs`), and a page whose notes the OCR set as close below the text as its lines names the lines that open them (`notes`); a scan whose lines curve, so their starts tell no indent, opens a paragraph only below a sentence’s end (`curved`); an edition that glosses its paragraphs in the margin leaves the glosses out of the text (`marginalia`)
- the printer’s signature at a sheet’s foot (Marx, Theorien über den Mehrwert. I. 7) is left out wherever a line naming the book closes three pages or more alike; a compound’s first part set apart before und or oder keeps its hyphen (Kredit- und Bankwesen)
- a table the OCR misread is restored by a scan correction that gives each row as a line, its cells parted by bars; a run of rows is written as a markdown table, headed by its first row where that row holds no figures; elsewhere a bar is a speck, and a glyph the OCR read from the page edge’s shadow, at the scan’s edge, is dropped
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

- `ekgwb` reads notebooks and years of letters; manifest entries for the 176 notebooks and 38 years of letters
- section pages find sections by slug through the entity store's type-and-slug index, and carry only what they show
- the Nachlass and letters come out again under the published-works rule; the page scaling stays
- `dta-tei` and `archive-ocr` adapters with the OCR gate for Homer, Idyllen aus Messina and the Philologica

### Phase 4 — Sigmund

- apparatus stripping for `archive-ocr`; OCR gate on GW I–XVII; Freud manifest and coverage note
- `sigmund` user added, content repo seeded, deploy, same verification

### Phase 5 — Karl

- `dta-tei`, `wikisource`, `mega-etx` and `mlwerke` adapters (#567); Marx manifest and coverage note (#567): 46 books, every scanned one through the OCR gate
- `karl` user added, content repo seeded, deploy (rover-pilot #181), same verification

## Risks

- **Scale.** A site build renders a page per section and holds every page's data at once: a lookup that scans the store on every page grows a build with the square of the brain, and text a page does not show grows its memory with every page. Friedrich with the Nachlass and the letters holds 18,468 sections.
- **OCR quality** of Fraktur scans: handled by the OCR gate; failing volumes become listed gaps.
- **"Complete" is bounded by licensing.** The coverage note shows what is missing and why; a licensing gap names the date or right that keeps the work out.

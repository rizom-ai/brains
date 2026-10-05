# Plan: Corpus brains — Friedrich, Karl, Sigmund

## Status

Proposed.

## Goal

Three fleet brains, each holding one author's works in German as read-only, citable passages:

| Brain       | Author              | Domain               | Content repo                       |
| ----------- | ------------------- | -------------------- | ---------------------------------- |
| `friedrich` | Friedrich Nietzsche | `friedrich.rizom.ai` | `rizom-ai/rover-friedrich-content` |
| `karl`      | Karl Marx           | `karl.rizom.ai`      | `rizom-ai/rover-karl-content`      |
| `sigmund`   | Sigmund Freud       | `sigmund.rizom.ai`   | `rizom-ai/rover-sigmund-content`   |

Asking a brain about an idea returns an answer grounded in passages, quoting the German original with work, section and edition.

## Non-goals

- No site; these are chat/MCP brains (`core`, `web`, `chat`).
- No topic extraction over the corpus (see entity design).
- No translations produced by the brain into the corpus; the corpus holds only published German texts.
- No letters written _to_ the author.

## Entity design: `@brains/corpus`

One new entity package registering two types, catalog member `corpus` in `packages/brain-cli/src/model/canonical-brain.ts`, selected per brain with `add: [corpus]` (as `docs` is today).

### `work` — one per published work, Nachlass group or letter volume

Frontmatter:

- `title`, `author`, `year` (first publication or writing year), `kind` (`work` | `nachlass` | `letters` | `excerpt`)
- `edition` — the edition the text was taken from
- `source` — URL of the source file
- `license` — `public-domain` | `CC-BY-SA-4.0`
- `attribution` — required credit line when the license asks for one
- `passages` — passage count, written by the importer

Body: short work description and table of contents (headings only).

### `passage` — the citable unit

Path `brain-data/passage/<work-slug>/<nnnn>.md`, id `<work-slug>:<nnnn>`.

Frontmatter:

- `work` — work id
- `order` — integer reading order within the work
- `heading` — heading path, e.g. `Zweites Buch › 3. Kapitel`
- `section` — the author's own numbering where it exists (aphorism number, `§`, chapter), else null
- `page` — source page reference, else null

Body: the passage text, unchanged except for markdown conversion.

Splitting rule:

1. split at the author's own units: numbered aphorisms, `§` sections, chapters and subsections, letters;
2. if a unit is over 8,000 UTF-8 bytes, split it at paragraph boundaries into consecutive passages sharing the heading;
3. never merge two of the author's units.

8,000 bytes keeps every passage inside one embedding input (`MAX_INPUT_TOKENS` in `shell/ai-service/src/online-embedding-provider.ts`), so each passage gets an unblended vector.

### Entity type config

- `actionPolicy: { create: "never", update: "never", delete: "never" }` on both types — the agent reads and cites, never edits; the importer writes through directory-sync.
- `projectionSourceRole: "excluded"` — no topic extraction over tens of thousands of passages.
- `includeInBroadSearch: true` for `passage`, `false` for `work`.
- `defaultSort` on `passage`: `work`, then `order`.

Phase 1 verifies that directory-sync import is not blocked by `actionPolicy: never`; if it is, the policy moves to `update`/`delete` only and `create` becomes `admin`.

## Brain identity

Each brain gets an `anchor-profile` and a `brain-character`:

- name: Friedrich / Karl / Sigmund
- role: reading companion to the author's works
- instructions: answer from passages found by search; quote the German original; cite `work › heading › section` and edition; say when the corpus has no passage on a question; answer in the user's language; do not speak as the author in the first person.

## Sources

Allowed: public-domain texts and CC BY-SA 4.0 texts. Excluded: Projekt Gutenberg-DE and Zeno.org (terms forbid automated copying and reuse), mlwerke.de (offline), any NC or ND license, and any modern editorial apparatus, introduction or translation still in copyright.

Editorial apparatus is stripped everywhere; only the author's text is imported.

### Sigmund

| Source                                                                          | Coverage                     | License                                             | Format          |
| ------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------- | --------------- |
| archive.org, Gesammelte Werke I–XVII (Imago, London 1940–52), `freud-YYYY-gw-N` | all works                    | public domain (author †1939; edition past §70 UrhG) | OCR text + hOCR |
| Deutsches Textarchiv                                                            | Studien über Hysterie (1895) | CC BY-SA 4.0                                        | TEI             |

Strip: editors' prefaces and notes (Anna Freud and co-editors are still in copyright).
Not covered: letters, Nachtragsband, index volume.

### Karl

| Source                                                 | Coverage                                                                                                                                                                                             | License                       | Format      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------- |
| MEGAdigital (`megadigital.bbaw.de/api/v2/tei-xml.xql`) | Kapital and drafts (MEGA² II), letters 1866–1871, excerpt volumes                                                                                                                                    | CC BY-SA 4.0 (per TEI header) | TEI         |
| Deutsches Textarchiv                                   | Kapital I–III, Achtzehnte Brumaire, Manifest                                                                                                                                                         | CC BY-SA 4.0                  | TEI         |
| archive.org scans                                      | Theorien über den Mehrwert (1905–10), Aus dem literarischen Nachlass (Mehring 1902), Gesammelte Schriften 1852–1862 (Rjasanoff 1917, Luise Kautsky's translations), Das Elend der Philosophie (1885) | public domain                 | OCR         |
| de.wikisource                                          | Zur Judenfrage, Thesen über Feuerbach, Kritik des Hegelschen Staatsrechts                                                                                                                            | public domain                 | wiki markup |
| gutenberg.org                                          | Briefwechsel Marx–Engels vol. 1 (1913)                                                                                                                                                               | public domain                 | text        |

Joint works with Engels (Manifest, Heilige Familie, Deutsche Ideologie) are included; Engels-only works are not.
Not covered: English and French writings with no public-domain German translation, letters before 1866 and after 1871, and Grundrisse, Ökonomisch-philosophische Manuskripte and Deutsche Ideologie until an open transcription is found.

### Friedrich

| Source                                          | Coverage                                                                           | License                     | Format |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------- | ------ |
| Deutsches Textarchiv                            | Zarathustra I–IV, Geburt der Tragödie, Homer, Idyllen aus Messina (first editions) | CC BY-SA 4.0                | TEI    |
| gutenberg.org                                   | 5 German titles                                                                    | public domain               | text   |
| archive.org, Großoktavausgabe (1894–1926) scans | published works, Nachlass selection, Philologica                                   | public domain (author text) | OCR    |

Not covered: the Colli–Montinari text and its Nachlass ordering, letters.
eKGWB (nietzschesource.org) is the complete source but is CC BY-NC-ND and disallows crawling; it is used only with written permission from Nietzsche Source, requested by the operator in Phase 4.

### OCR quality gate

Every OCR source passes a gate before import: sample 20 random pages per volume against the scan; fewer than 1 wrong word per 200 passes. Volumes that fail are re-OCRed from the scan images with Tesseract's Fraktur model (`frk`/`deu_frak`) for Fraktur volumes, `deu` otherwise, then gated again. A volume that still fails stays out and is listed as a gap.

### Coverage manifest

Each brain's content repo carries a `coverage` note: every work in the author's oeuvre, with status `imported` (source, edition) or `gap` (reason). Asked about a gap, the brain says the work is not in its corpus.

## Importer: `packages/corpus-import`

Private workspace package, not published. One CLI:

```sh
bun packages/corpus-import/src/cli.ts <manifest> <content-repo>/brain-data
```

- `manifests/{freud,marx,nietzsche}.yaml` — one entry per work: source adapter, source URL, edition, license, strip rules.
- source adapters: `dta-tei`, `mega-tei`, `archive-ocr`, `gutenberg-text`, `wikisource`.
- each adapter yields `{ heading, section, page, paragraphs }` units; one shared splitter turns units into `passage` files and writes the `work` file.
- deterministic output: rerunning on the same sources produces byte-identical files, so reimports show only real changes in git.
- downloads are cached locally and never committed.

Flow per work:

1. fetch the source into the cache, or fail with the URL;
2. parse with the adapter and fail on unknown structure, never guess;
3. strip editorial apparatus by the manifest's rules;
4. split into units, then passages;
5. validate every file against `@brains/corpus` schemas, failing on any invalid file;
6. write `work/<slug>.md` and `passage/<slug>/<nnnn>.md`, removing stale passages of that work.

## Fleet setup (rover-pilot)

- new cohort `cohorts/corpus.yaml`: `bundlesOverride: [core, web, chat]`, `addOverride: [corpus]`, members `friedrich`, `karl`, `sigmund`, `brainVersionOverride` = the first release containing `@brains/corpus`
- per brain: `bunx brains-ops user:add . <handle> --cohort corpus`, Discord disabled, setup email `yeehaa@rizom.ai`, `anchorProfile.name` set, then `secrets:encrypt` and `onboard` (creates the content repo)
- corpus content is committed to the content repo by the importer; directory-sync pulls it

## Phases

Each phase ships on its own PR, tests first.

### Phase 1 — walking skeleton

- `@brains/corpus` with `work` and `passage` schemas, adapters and entity type config; tests for schema, markdown round trip, action policy, sort order
- `corpus` catalog member in `canonical-brain.ts`
- `corpus-import` with the shared splitter and the `dta-tei` adapter; tests for splitting (unit boundaries, 8,000-byte split, determinism)
- import Studien über Hysterie into a local test app started from `packages/brain-cli`; verify `system_search` returns passages with work and heading, and that the agent cannot update or delete a passage

### Phase 2 — Sigmund

- `archive-ocr` adapter with apparatus stripping; OCR gate on GW I–XVII
- full Freud import locally: measure import time, index-readiness time and DB size; the readiness gate must clear before deploy
- release, `corpus` cohort, `sigmund` user, content repo seeded, deploy
- verify `https://sigmund.rizom.ai/health/ready` is 200 and a chat question returns cited passages

### Phase 3 — Karl

- `mega-tei`, `gutenberg-text` and `wikisource` adapters; Marx manifest; coverage note
- `karl` user added to the cohort, content repo seeded, deploy, same verification

### Phase 4 — Friedrich

- Nietzsche manifest from DTA, gutenberg.org and Großoktavausgabe scans; coverage note
- `friedrich` user added, content repo seeded, deploy, same verification
- operator asks Nietzsche Source for permission to use the eKGWB XML; on a yes, an `ekgwb-tei` adapter replaces the Großoktavausgabe works and the Nachlass and letters move from `gap` to `imported`

## Risks

- **Scale.** Directory-sync stress was proven to 700 files; Marx will be over 10,000 passages. Phase 2's full local import is the measurement; if initial sync or indexing does not finish within the deploy readiness window, the importer additionally ships a prebuilt index alongside the content repo, planned on that evidence.
- **OCR quality** of Fraktur scans: handled by the OCR gate; failing volumes become listed gaps, never silent noise.
- **"Complete" is bounded by licensing.** The coverage note shows exactly what is missing and why.

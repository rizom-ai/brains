# Plan: Documents

Last updated: 2026-11-28

## Status

Proposed. Documents get the treatment images got in Studio, the brain keeps the EPUBs it makes, and it reads the documents people upload. Six phases, each shippable alone.

## Why

- **Documents have no page.** PDFs arrive from Obsidian, WebDAV, synced folders, Chat and deck carousels, and are stored as `document` entries, but Studio has no document-specific code. Opening one in the editor shows its `asset://sha256/…` reference as the body.
- **The brain makes EPUBs it cannot keep.** Every site build renders each public book to an EPUB beside its title page (`entities/book/src/lib/book-epub-staging.ts`), but the `document` type accepts only `application/pdf` (`documentMimeTypeSchema` is a literal). The EPUB exists only in the build output.
- **Documents are never read.** `document` is registered with `embeddable: false` and `fullTextSearchable: false`. Embeddings and full-text search index an entry's stored `content`, which for a document is the file reference. A PDF attached in Chat is read for that conversation only (`shell/ai-service/src/text-only-messages.ts`), and an upload can be turned into a separate note (`entities/note/src/lib/upload-markdown-import.ts`).

## What is there today

- **Type.** `entities/document`, with metadata in `shared/document/src/schemas/document.ts`: an editable `title`, read-only `mimeType`, `filename`, `pageCount`, `sizeBytes`, `status`, provenance (`sourceEntityType`, `sourceEntityId`, `sourceUpload*`) and `attachmentType`, a free string (`"uploaded"` from uploads, `"carousel"` from the content pipeline). Bytes live in asset rows, at most 25 MB (`DOCUMENT_ASSET_MAX_BYTES`).
- **Arrival.** Studio's `POST /studio/api/upload` already accepts PDFs (the type claims `application/pdf` through `create.fromUpload`), up to Studio's 10 MB upload limit. WebDAV and the Obsidian plugin take a PDF in the `document/` folder, checked with `isPdfBytes` and counted with `countPdfPages` (`plugins/webdav/src/dav-saves.ts`). Directory sync keeps a PDF beside a `.meta.json` sidecar.
- **Rendering.** `document:generate` renders a URL to PDF or asks an attachment provider (the deck carousel). `renderEpub` in `@brains/media-page-composer` writes EPUBs with its own zip writer; there is no zip reader.
- **Extraction.** `extractPdfMarkdown` (`shared/document/src/lib/pdf-markdown.ts`, pdfjs) refuses a PDF over 50 pages or 5 MB rather than cutting it off.
- **Serving.** `createArtifactResponse` serves an artifact inline or as a download with its filename; Studio's image preview and web chat's attachment route use it.
- **References.** Social posts attach documents through `documentIds` in frontmatter. A rendered document names its source through `sourceEntityType` and `sourceEntityId`. There is no body link form for documents.
- **The model to follow.** Studio's Images page: a grid (`studio-images-view.tsx`), upload from the page, a details panel with title, alt text and "Used in" (`editor-image-details.ts`), and alt text the vision model writes in the background without overwriting a person's.

## Decisions

- **The stored type stays `document`.** It is the folder name in WebDAV, Obsidian and directory sync, and part of entry ids that posts reference. Studio calls the page "Documents", and each card names its format ("PDF · 12 pages · 2.4 MB").
- **A document declares where it came from.** A new `origin` field, `uploaded` or `rendered`, set by every path that creates one. `rendered` means a view of another entry, named by `sourceEntityType` and `sourceEntityId`. Rules about documents read `origin`, not the presence of provenance fields.
- **Rendered documents are not read.** Their source is already in the brain; reading them would put every passage in search and Chat twice.
- **Reading is a capability of the entity service, not a second entry.** An entity type may supply the text it is indexed by. The document keeps its file; search and Chat find the document itself.

## Phases

### 1. The Documents page

A page under Library › Media beside Images, for PDFs as they are stored today.

- **List:** `GET /studio/api/document-library` returns title, format, page count, size and date, newest first, read at the caller's visibility.
- **Upload:** from the page, through the existing upload route. Studio's upload limit follows the type's own (25 MB for documents, 10 MB otherwise).
- **Details:** `GET /studio/api/document?id=` streams the file through `createArtifactResponse`; the panel shows a PDF in the browser's viewer, an editable title, Download, and the facts. "Used in" lists the posts whose `documentIds` name it; "Made from" links a rendered document's source.
- **Editor:** opening a document from Library goes to this panel instead of the raw reference.

Flow: upload → type check (not a PDF: 415, says what is accepted) → size check (over 25 MB: 413, says the limit) → stored → card appears. Preview fails to load → the panel says so and offers Download.

### 2. Declared origin

- `origin: "uploaded" | "rendered"` on the metadata schema, read-only in Studio.
- Every creation path sets it: upload, WebDAV, Obsidian and directory sync as `uploaded`; `document:generate` as `rendered`.
- Existing documents: read as `rendered` when they name a source entity, otherwise `uploaded`. Files on disk are not rewritten; the next save writes the field.

### 3. EPUB documents

- The type accepts `application/epub+zip` beside PDF: `mimeType` becomes an enum, and an EPUB is checked by its zip signature and its `mimetype` entry.
- A small zip reader beside the writer in `@brains/media-page-composer`, on `node:zlib`.
- `pageCount` stays for PDFs; an EPUB records `sectionCount` from its spine.
- Upload, WebDAV, the Obsidian plugin and directory sync take `.epub` in the `document/` folder. The plugin's README and version follow.
- Studio's panel shows an EPUB's table of contents and Download; browsers do not open EPUBs.

Flow: `.epub` saved → not a zip or no `mimetype` entry → refused with the reason (WebDAV 422, the vault keeps the file with a note) → otherwise stored.

### 4. A book's EPUB is kept

- Rendering moves from the site build to a job: when a public book or one of its sections changes, `document:generate` renders its EPUB as a `rendered` document, deduplicated per book.
- The site build copies the stored EPUB to the book's path instead of rendering its own.
- The document follows its book's visibility: a book made private takes its EPUB off the site at the next build and narrows the document.

Flow: book changes → job queued (deduplicated) → render fails → the previous document stays and the failure is reported on the book's Site status → the build serves the previous EPUB.

### 5. Reading documents

- **Entity service:** a type may declare `searchText`, an async function from an entry to the text it is indexed by. Embedding and full-text indexing use it when present, keyed by content hash as now, so text is extracted again only when the file changes.
- **Documents** declare it for `origin: "uploaded"`: PDF text through pdfjs, EPUB text from its spine. Rendered documents declare none.
- **Background, not inline:** extraction runs in the indexing job, with a page limit raised for background work; a document over it is read up to the limit and says so in its details ("Read 200 of 340 pages").
- **Visibility is unchanged:** search and Chat find a document only for callers who may read it. A public document becomes quotable by the site's guest Ask box.

Flow: document stored → indexing job → no text layer (a scanned PDF) → recorded as "No text to read", nothing indexed → otherwise indexed; Chat cites the document with a source chip that opens it.

### 6. A description for each document

- The brain writes a one-line description from the extracted text, as the vision model writes alt text, stored as `description` with `descriptionSource: "generated"`.
- A person's edit sets `descriptionSource: "owner"` and is never overwritten.
- The card and the details panel show it; documents without text get none.

## Order and risk

Phases 1 and 2 stand alone and change no stored behavior beyond a field. Phase 3 touches every path that takes a file. Phase 4 moves work from the site build to a job and needs a fleet-wide check that every public book renders. Phase 5 changes the entity service's indexing, so it lands behind tests that cover existing types unchanged before documents use it.

## Open questions

- **Public documents in the guest Ask box.** Phase 5 makes a public document's text quotable by site visitors. Default: yes, as with public notes; a document can be made `shared` to keep it out.
- **Image alt text through `searchText`.** The same hook could make images findable by their alt text. Default: a follow-up after phase 5.

# Plan: Book EPUB export

Last updated: 2026-10-13

## Status

Not started. The prerequisite has shipped: media formats render from registered view templates (#624, `@rizom/brain` 0.2.0-alpha.544).

## Outcome

A reader downloads any published book as an EPUB from its title page, from a `Download EPUB ↓` link opposite `Begin reading →` ([mockup](../design/book-epub-mockup.html)). The owner gets the same file in chat.

## Design

The EPUB is a format of a registered view template, like the printable PDF and the OG image.

1. **Format.** `epub` joins `image` and `pdf` as a media format. A template registers its EPUB component in `layout.formats.epub`, and its props are parsed against the template's schema.
2. **Template.** `@brains/book` registers `book:epub`. Its data is the book and its sections in reading order, with split sections joined. Its EPUB component renders the book as XHTML: the book's details, one marked chapter per section, and the colophon.
3. **Capture.** `media-page-composer` renders the EPUB component to XHTML without a browser and splits it at its chapter marks. It writes the `mimetype` entry first and uncompressed, then `META-INF/container.xml`, the package document, the navigation document built from the chapter headings, and the chapters, and zips them with fflate. Timestamps are fixed, so the same book yields the same bytes.
4. **Provider.** `createEpubProvider` resolves `book` → `epub` through `views`. It returns `application/epub+zip`, which the publish contract and the `document` entity accept.
5. **Storage.** Each published book's EPUB is a `document` entity, regenerated when the book's text changes. Until documents move to asset storage ([durable-binary-assets](./durable-binary-assets.md)), each EPUB is also committed to the content repo as a binary.
6. **Site.** The site build writes each published book's EPUB document to `/books/<slug>.epub`. The title page shows the link when the EPUB exists.

The texts' licences allow this. Public-domain and CC BY-SA texts can be redistributed freely. CC BY-NC-ND 4.0 permits verbatim non-commercial redistribution in another format, with the attribution and licence notice carried in the colophon.

## Phases

1. **Download one book.** Format, template with sections as flat chapters, capture, provider, document storage, site file and title-page link. Tests:
   - the first zip entry is the uncompressed `mimetype`;
   - the container points to the package document;
   - the spine lists every section in reading order;
   - the site build writes the file;
   - the title page links to it only when it exists.
2. **Structure.** Navigation nests by section headings, split sections join into one chapter, and chapters carry the book's language. Tests on a book with nested headings and a split section.
3. **Colophon and metadata.** Edition, source, attribution and licence on a colophon page and in the package metadata; the same book yields the same bytes. Tests for each field and for byte equality.
4. **Friedrich.** Generate all 26 books, check that each opens in an EPUB reader, and link them from their title pages.

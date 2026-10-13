# Plan: Book EPUB export

Last updated: 2026-10-13

## Status

In progress on #628: phases 1 and 2 are built. The prerequisite has shipped: media formats render from registered view templates (#624, `@rizom/brain` 0.2.0-alpha.544).

## Outcome

A reader downloads any book on the site as an EPUB from its title page, from a `Download EPUB ↓` link opposite `Begin reading →` ([mockup](../design/book-epub-mockup.html)).

## Design

The EPUB is a format of a registered view template, like the printable PDF and the OG image.

1. **Format.** `epub` joins `image` and `pdf` as a media format. A template registers its EPUB component in `layout.formats.epub`, and its props are parsed against the template's schema.
2. **Template.** `@brains/book` registers `book:epub`. Its data is the book and its sections in reading order, with split sections joined. Its EPUB component renders the book as XHTML: the book's details, one marked chapter per section, and the colophon.
3. **Capture.** `media-page-composer` renders the EPUB component to XHTML without a browser and splits it at its chapter marks. It writes the `mimetype` entry first and uncompressed, then `META-INF/container.xml`, the package document, the navigation document built from the chapter headings, and the chapters, and zips them with fflate. Timestamps are fixed, so the same book yields the same bytes.
4. **Site.** On every site build, the book plugin renders each public book with sections through `book:epub` and writes it to `/books/<id>.epub` in the build staging directory, as the blog writes its feed. The file always matches the pages built with it, and nothing binary is stored or committed. A failure fails the build, so the previous generation stays live.
5. **Title page.** A book with sections links to its EPUB opposite `Begin reading →`.

The texts' licences allow this. Public-domain and CC BY-SA texts can be redistributed freely. CC BY-NC-ND 4.0 permits verbatim non-commercial redistribution in another format, with the attribution and licence notice carried in the colophon.

## Phases

1. **Download one book.** Format, template with sections as flat chapters, capture, staging and title-page link. Tests:
   - the first zip entry is the uncompressed `mimetype`;
   - the container points to the package document;
   - the spine lists every section in reading order;
   - the site build writes the file;
   - the title page links to it only for a book with sections.
2. **Structure.** Navigation nests by section headings, each heading opens once in the text, and split sections join into one chapter. The text is German, as on the book pages. Tests on a book with headings and a split section.
3. **Colophon and metadata.** Edition, source, attribution and licence on a colophon page and in the package metadata; the same book yields the same bytes. Tests for each field and for byte equality.
4. **Friedrich.** Generate all 26 books, check that each opens in an EPUB reader, and link them from their title pages.

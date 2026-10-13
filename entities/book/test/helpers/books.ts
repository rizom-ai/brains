import { bookSectionAdapter } from "../../src/adapters/book-section-adapter";
import type { Book } from "../../src/schemas/book";
import type { BookSection } from "../../src/schemas/book-section";

/** A book entity with its details and an empty contents. */
export function book(id: string, title: string, extra = ""): Book {
  const content = `---
title: ${title}${extra}
source: https://example.org/${id}
author: Erfundener Autor
year: 1888
kind: work
edition: Testausgabe
license: public-domain
---

## Contents
`;
  return {
    id,
    entityType: "book",
    content,
    contentHash: id,
    created: "2026-10-06T00:00:00.000Z",
    updated: "2026-10-06T00:00:00.000Z",
    visibility: "public",
    metadata: { title },
  };
}

/** A section entity of a book, at its place in reading order. */
export function section(
  id: string,
  bookId: string,
  order: number,
  title: string,
  siglum = `S-${order}`,
  headings: string[] = [],
): BookSection {
  const content = `---
title: ${title}
book: ${bookId}
order: ${order}
section: ${siglum}
page: null
source: https://example.org/${bookId}/${order}
headings: ${JSON.stringify(headings)}
---

Erfundener Text ${order}.
`;
  const parsed = bookSectionAdapter.fromMarkdown(content);
  if (!parsed.metadata) throw new Error("Expected section metadata");
  return {
    id,
    entityType: "book-section",
    content,
    contentHash: id,
    created: "2026-10-06T00:00:00.000Z",
    updated: "2026-10-06T00:00:00.000Z",
    visibility: "public",
    metadata: parsed.metadata,
  };
}

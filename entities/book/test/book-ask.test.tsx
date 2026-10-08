/** @jsxImportSource react */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { Window } from "happy-dom";
import { createMockShell } from "@brains/plugins/test";
import type { BaseDataSourceContext, BaseEntity } from "@brains/plugins";
import { createMockLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { bookAdapter } from "../src/adapters/book-adapter";
import { BookAskDataSource } from "../src/datasources/book-ask-datasource";
import { BookAskTemplate } from "../src/templates/book-ask";

function titleEntry(book: string, title: string, year: number): BaseEntity {
  const content = `---
title: ${title}
book: ${book}
order: 0
section: null
page: null
source: https://example.org/${book}
author: Erfundener Autor
year: ${year}
kind: work
---

Titel.
`;
  return {
    id: `${book}:00000`,
    entityType: "book",
    content,
    contentHash: book,
    created: "2026-10-06T00:00:00.000Z",
    updated: "2026-10-06T00:00:00.000Z",
    visibility: "public",
    metadata: bookAdapter.fromMarkdown(content).metadata ?? {},
  };
}

const askSchema = z.object({
  name: z.string(),
  askBox: z.boolean(),
  books: z.array(
    z.object({
      book: z.string(),
      title: z.string(),
      year: z.number().nullable(),
    }),
  ),
});

describe("BookAskDataSource", () => {
  it("names the brain, says whether asking is open and lists the books", async () => {
    const shell = createMockShell();
    shell.addEntities([
      titleEntry("spaet", "Ein spätes Buch", 1888),
      titleEntry("frueh", "Ein frühes Buch", 1872),
    ]);
    const context: BaseDataSourceContext = {
      entityService: shell.getEntityService(),
    };
    const source = new BookAskDataSource(createMockLogger(), {
      name: (): string => "Friedrich",
      chatAvailable: async (): Promise<boolean> => true,
    });

    const result = await source.fetch({}, askSchema, context);

    expect(result).toEqual({
      name: "Friedrich",
      askBox: true,
      books: [
        { book: "frueh", title: "Ein frühes Buch", year: 1872 },
        { book: "spaet", title: "Ein spätes Buch", year: 1888 },
      ],
    });
  });
});

const props = {
  name: "Friedrich",
  askBox: true,
  books: [{ book: "spaet", title: "Ein spätes Buch", year: 1888 }],
};

describe("BookAskTemplate", () => {
  it("offers the guest box under the brain's name", () => {
    const html = render(<BookAskTemplate {...props} />);

    expect(html).toContain(">Ask Friedrich</h1>");
    expect(html).toContain('data-ask-box=""');
    expect(html).toContain('data-ask-name="Friedrich"');
    expect(html).toContain('src="/ask/assets/box.js"');
    expect(html).toContain("cites every passage");
  });

  it("says asking is closed instead of offering a box that cannot answer", () => {
    const html = render(<BookAskTemplate {...props} askBox={false} />);

    expect(html).not.toContain('data-ask-box=""');
    expect(html).not.toContain("/ask/assets/box.js");
    expect(html).toContain("Asking Friedrich is not open yet.");
  });
});

/** The page in a browser, its own script run. */
function page(search = ""): Window {
  const window = new Window({ url: `https://books.example/ask${search}` });
  window.document.write(render(<BookAskTemplate {...props} />));
  const script = Array.from(window.document.querySelectorAll("script")).find(
    (element) => !element.getAttribute("src"),
  );
  window.eval(script?.textContent ?? "");
  return window;
}

describe("BookAskTemplate script", () => {
  it("lists the passages an answer drew on, linked to their pages", () => {
    const window = page();
    const box = window.document.querySelector("[data-ask-box]");
    box?.dispatchEvent(
      new window.CustomEvent("ask:sources", {
        bubbles: true,
        detail: {
          sources: [
            { id: "book:spaet:00007-7", title: "SPAET-7" },
            // A book with parts files each section under its part's folder.
            { id: "book:spaet:00009-ii:00012-11", title: "SPAET-II-11" },
            { id: "topic:mitleid", title: "Mitleid" },
            {
              id: "book:spaet:00000-ein-spaetes-buch",
              title: "Ein spätes Buch",
            },
          ],
        },
      }),
    );

    const links = Array.from(
      window.document.querySelectorAll("[data-book-passages] a"),
    );
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/books/spaet/7",
      "/books/spaet/12",
      "/books/spaet",
    ]);
    expect(links[0]?.textContent).toContain("SPAET-7");
    expect(links[0]?.textContent).toContain("Ein spätes Buch");
    expect(links[0]?.textContent).toContain("1888");
    expect(
      window.document
        .querySelector("[data-book-passages]")
        ?.hasAttribute("hidden"),
    ).toBe(false);
    void window.happyDOM.close();
  });

  it("starts the question a reading page asked for", () => {
    const window = page("?q=About%20AC-2%3A%20");
    const field = window.document.querySelector("[data-ask-box] textarea");

    expect(
      field instanceof window.HTMLTextAreaElement ? field.value : null,
    ).toBe("About AC-2: ");
    void window.happyDOM.close();
  });
});

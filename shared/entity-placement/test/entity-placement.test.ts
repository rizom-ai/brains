import { describe, expect, it } from "bun:test";
import {
  buildEntityPath,
  containmentOf,
  getEntityFileExtension,
  parseEntityPath,
  resolveEntityPlacement,
  type Containment,
} from "../src";

const none: Containment = new Map();
const books: Containment = new Map([["book-section", "book"]]);

describe("entity placement", () => {
  it("reads the containment off the registry's type configs", () => {
    const configs: Record<string, { containedIn?: string }> = {
      note: {},
      book: {},
      "book-section": { containedIn: "book" },
    };
    expect(
      containmentOf({
        getEntityTypes: () => Object.keys(configs),
        getEntityTypeConfig: (type) => configs[type] ?? {},
      }),
    ).toEqual(books);
  });

  it("places a note at the root and every other type in its folder", () => {
    expect(buildEntityPath("readme", "note", ".md", none)).toBe("readme.md");
    expect(buildEntityPath("first", "post", ".md", none)).toBe("post/first.md");
    expect(parseEntityPath("readme.md", none)).toEqual({
      entityType: "note",
      id: "readme",
    });
    expect(parseEntityPath("post/first.md", none)).toEqual({
      entityType: "post",
      id: "first",
    });
  });

  it("turns each id segment into a folder", () => {
    expect(buildEntityPath("home:hero", "site-content", ".md", none)).toBe(
      "site-content/home/hero.md",
    );
    expect(parseEntityPath("site-content/home/hero.md", none)).toEqual({
      entityType: "site-content",
      id: "home:hero",
    });
  });

  it("places a contained entity inside its container's folder", () => {
    expect(buildEntityPath("dune:intro", "book-section", ".md", books)).toBe(
      "book/dune/intro.md",
    );
    expect(parseEntityPath("book/dune/intro.md", books)).toEqual({
      entityType: "book-section",
      id: "dune:intro",
    });
    expect(parseEntityPath("book/dune.md", books)).toEqual({
      entityType: "book",
      id: "dune",
    });
  });

  it("strips image and document extensions as it does markdown", () => {
    expect(parseEntityPath("image/cover.png", none)).toEqual({
      entityType: "image",
      id: "cover",
    });
    expect(parseEntityPath("document/report.pdf", none)).toEqual({
      entityType: "document",
      id: "report",
    });
    expect(parseEntityPath("post/notes.txt", none)).toEqual({
      entityType: "post",
      id: "notes.txt",
    });
  });

  it("admits a placement only when the path reads back as the same entity", () => {
    expect(resolveEntityPlacement("post", "first", ".md", none)).toEqual({
      relativePath: "post/first.md",
      owner: { entityType: "post", id: "first" },
      writable: true,
    });
    expect(
      resolveEntityPlacement("book-section", "dune:intro", ".md", books),
    ).toMatchObject({ relativePath: "book/dune/intro.md", writable: true });
    // A nested note would read back as another type.
    expect(resolveEntityPlacement("note", "a:b", ".md", none)).toMatchObject({
      relativePath: "a/b.md",
      owner: { entityType: "a", id: "b" },
      writable: false,
    });
    expect(resolveEntityPlacement("post", "a:..:b", ".md", none).writable).toBe(
      false,
    );
  });

  it("names the file extension an entity is stored under", () => {
    const entity = (
      entityType: string,
      metadata: Record<string, unknown> = {},
      content = "",
    ): {
      entityType: string;
      metadata: Record<string, unknown>;
      content: string;
    } => ({
      entityType,
      metadata,
      content,
    });
    expect(getEntityFileExtension(entity("post"))).toBe(".md");
    expect(getEntityFileExtension(entity("document"))).toBe(".pdf");
    expect(getEntityFileExtension(entity("image", { format: "jpeg" }))).toBe(
      ".jpg",
    );
    expect(
      getEntityFileExtension(
        entity("image", {}, "data:image/svg+xml;base64,AAAA"),
      ),
    ).toBe(".svg");
    expect(getEntityFileExtension(entity("image"))).toBe(".md");
  });
});

// A YAML type's file (docs/external-plugin-authoring.md, The stored format) is named
// by its ID, as a markdown file is.
describe("a YAML type's file", () => {
  it("reads its ID without the extension", () => {
    expect(parseEntityPath("form/contact.yaml", none)).toEqual({
      entityType: "form",
      id: "contact",
    });
  });

  it("takes the text extension its store writes", () => {
    const form = { entityType: "form", metadata: {}, content: "" };
    expect(getEntityFileExtension(form, ".yaml")).toBe(".yaml");
    expect(getEntityFileExtension(form)).toBe(".md");
  });
});

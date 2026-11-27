/** @jsxImportSource react */
import { describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioMarkdown, fenceLeadingFrontmatter } from "./studio-markdown";

// A note keeps frontmatter keys its type does not name in its body, as
// written. The preview must not read that block as a heading.
const note = [
  "---",
  "slug: typescript-patterns",
  "checksum: seed",
  "---",
  "# TypeScript Design Patterns",
  "",
  "Patterns I keep coming back to.",
].join("\n");

function render(markdown: string): Window["document"] {
  const window = new Window();
  window.document.body.innerHTML = renderToStaticMarkup(
    <StudioMarkdown presentation="document">{markdown}</StudioMarkdown>,
  );
  return window.document;
}

describe("document preview of a leading frontmatter block", () => {
  it("shows the block as literal YAML, not as a heading", () => {
    const doc = render(note);
    const headings = [...doc.querySelectorAll("h1, h2, h3, h4, h5, h6")].map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual(["TypeScript Design Patterns"]);
    expect(doc.querySelector("hr")).toBeNull();
    expect(doc.body.textContent).toContain("slug: typescript-patterns");
    expect(doc.body.textContent).toContain("checksum: seed");
  });

  it("fences only a block that starts the document with a YAML key", () => {
    expect(fenceLeadingFrontmatter(note)).toBe(
      [
        "```yaml",
        "slug: typescript-patterns",
        "checksum: seed",
        "```",
        "# TypeScript Design Patterns",
        "",
        "Patterns I keep coming back to.",
      ].join("\n"),
    );
    const ruled = "---\nA paragraph between rules\n---\nMore";
    expect(fenceLeadingFrontmatter(ruled)).toBe(ruled);
    const later = "Intro\n\n---\nkey: value\n---\n";
    expect(fenceLeadingFrontmatter(later)).toBe(later);
  });

  it("uses a fence longer than any backtick run inside the block", () => {
    expect(fenceLeadingFrontmatter("---\nnote: ```x```\n---\nBody")).toBe(
      "````yaml\nnote: ```x```\n````\nBody",
    );
  });
});

/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import type { DocWithData } from "../src/schemas/doc";
import { DocListTemplate } from "../src/templates/doc-list";

const createDoc = (
  id: string,
  updated: string,
  order: number,
): DocWithData => ({
  id,
  entityType: "doc",
  content: `# ${id}`,
  created: "2026-01-01T00:00:00.000Z",
  updated,
  visibility: "public",
  metadata: {
    title: id,
    section: "Start here",
    order,
    sourcePath: `docs/${id}.md`,
    description: null,
    slug: id,
  },
  contentHash: `hash-${id}`,
  frontmatter: {
    title: id,
    section: "Start here",
    order,
    sourcePath: `docs/${id}.md`,
    description: null,
    slug: id,
  },
  body: `# ${id}`,
});

describe("DocListTemplate", () => {
  test("shows the month of the latest documentation update", () => {
    const html = render(
      <DocListTemplate
        baseUrl={null}
        docs={[
          createDoc("older", "2026-04-18T10:00:00.000Z", 1),
          createDoc("latest", "2026-08-30T17:20:03.000Z", 2),
        ]}
        pagination={null}
      />,
    );

    expect(html).toContain("August 2026");
    expect(html).not.toContain("April 2026");
  });

  test("omits update freshness when there are no docs", () => {
    const html = render(
      <DocListTemplate baseUrl={null} docs={[]} pagination={null} />,
    );

    expect(html).not.toContain("Updated");
  });
});

/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { docsChromeSchema, type DocsChrome } from "@brains/docs-chrome";
import type { DocWithData } from "../src/schemas/doc";
import type { DocsHero } from "../src/config";
import { getTemplates } from "../src/lib/register-templates";
import {
  DocHomeHeaderTemplate,
  DocHomeHeroTemplate,
  DocHomeSectionsTemplate,
  DocListTemplate,
} from "../src/templates/doc-list";

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
    description: null,
    slug: id,
  },
  contentHash: `hash-${id}`,
  frontmatter: {
    title: id,
    section: "Start here",
    order,
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

const docs = [
  createDoc("older", "2026-04-18T10:00:00.000Z", 1),
  createDoc("latest", "2026-08-30T17:20:03.000Z", 2),
];

const hero: DocsHero = {
  label: "Handbook · Example docs",
  title: "Build, run, and publish",
  accent: "things.",
  lead: "Documentation for the example.",
};

const chrome: DocsChrome = docsChromeSchema.parse({
  brand: { label: "Example docs", href: "/docs" },
  links: [{ label: "Guides", href: "/guides", area: "guides" }],
});

describe("docs list copy", () => {
  test("opens on plain documentation copy, with no header of its own, by default", () => {
    const html = render(
      <DocListTemplate baseUrl={null} docs={docs} pagination={null} />,
    );

    expect(html).toMatch(/<h1[^>]*>Documentation<\/h1>/);
    expect(html).not.toContain('class="docs-header');
    expect(html).not.toMatch(/Brains docs|Get Brains|Build, run, and publish/);
    expect(html).not.toContain("brains.</em>");
    expect(html).not.toContain("rizom");
  });

  test("opens on the configured hero, under the configured header", () => {
    const html = render(
      <DocHomeHeroTemplate
        baseUrl={null}
        docs={docs}
        pagination={null}
        hero={hero}
        chrome={chrome}
      />,
    );

    expect(html).toContain("Handbook · Example docs");
    expect(html).toMatch(
      /Build, run, and publish(<!-- -->)? ?<em[^>]*>things\.<\/em>/,
    );
    expect(html).toContain("Documentation for the example.");
    expect(html).toMatch(/docs-header.*?Example docs/);
  });
});

describe("docs home in parts", () => {
  test("the whole list is the hero and the sections on one page", () => {
    const html = render(
      <DocListTemplate
        baseUrl={null}
        docs={docs}
        pagination={null}
        hero={hero}
      />,
    );

    expect(html).toContain("Build, run, and publish");
    expect(html).toContain('id="sections"');
    expect(html).toContain('class="docs-handbook"');
  });

  test("the hero opens the page and leaves the sections to a later part", () => {
    const html = render(
      <DocHomeHeroTemplate
        baseUrl={null}
        docs={docs}
        pagination={null}
        hero={hero}
        chrome={chrome}
      />,
    );

    expect(html).toContain("docs-header");
    expect(html).toContain("Build, run, and publish");
    expect(html).toContain("docs-handbook--continued");
    expect(html).not.toContain('id="sections"');
  });

  test("the sections continue the page without a second header", () => {
    const html = render(
      <DocHomeSectionsTemplate
        baseUrl={null}
        docs={docs}
        pagination={null}
        hero={hero}
        chrome={chrome}
      />,
    );

    expect(html).toContain('id="sections"');
    expect(html).toContain('href="/docs/latest"');
    expect(html).not.toContain("docs-header");
    expect(html).not.toContain("Build, run, and publish");
  });

  test("the header alone opens a page whose site draws its own opening", () => {
    const html = render(
      <DocHomeHeaderTemplate
        baseUrl={null}
        docs={docs}
        pagination={null}
        hero={hero}
        chrome={chrome}
      />,
    );

    expect(html).toMatch(/docs-header.*?Example docs/);
    expect(html).toContain("docs-handbook--continued");
    expect(html).not.toContain("Build, run, and publish");
    expect(html).not.toContain('id="sections"');
  });

  test("registers the parts as templates over the docs data source", () => {
    const templates = getTemplates();

    expect(templates["doc-home-hero"]?.dataSourceId).toBe("docs:entities");
    expect(templates["doc-home-header"]?.dataSourceId).toBe("docs:entities");
    expect(templates["doc-home-sections"]?.dataSourceId).toBe("docs:entities");
  });
});

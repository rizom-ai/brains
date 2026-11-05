/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  GuideSectionsTemplate,
  type GuideSection,
  type SectionDoc,
} from "../src";
import { getTemplates } from "../src/lib/register-templates";
import type { GuideWithData } from "../src/schemas/guide";
import { guideWithData } from "./fixtures";

function doc(slug: string, section: string, order: number): SectionDoc {
  return {
    id: slug,
    title: `Doc ${slug}`,
    section,
    order,
    slug,
    description: null,
  };
}

function withSummary(guide: GuideWithData, summary: string): GuideWithData {
  const fields = { ...guide.frontmatter, summary };
  return { ...guide, metadata: fields, frontmatter: fields };
}

const extendDocs = ["a", "b", "c", "d", "e", "f"].map((slug, index) =>
  doc(slug, "Extend a brain", 200 + index),
);

const sections: GuideSection[] = [
  {
    name: "Use a brain",
    guides: [
      withSummary(guideWithData("writer", 10), "Years of essays and drafts"),
      guideWithData("researcher", 20),
    ],
    docs: [doc("feature-overview", "Use a brain", 10)],
  },
  {
    name: "Run a brain",
    guides: [guideWithData("self-hosting", 30)],
    docs: [],
  },
  { name: "Extend a brain", guides: [], docs: extendDocs },
];

describe("GuideSectionsTemplate", () => {
  const html = render(<GuideSectionsTemplate sections={sections} />);

  test("gives each docs section a column named by its heading", () => {
    expect(html).toContain(">Use a brain</h2>");
    expect(html).toContain(">Extend a brain</h2>");
  });

  test("lists a section's guides by persona, linked to the guide", () => {
    expect(html).toContain('href="/guides/writer"');
    expect(html).toContain("The writer");
    expect(html.indexOf("The writer")).toBeLessThan(
      html.indexOf("The researcher"),
    );
  });

  test("gives a guide its summary, leaving who it is for to the guide", () => {
    expect(html).toContain(">Years of essays and drafts<");
    expect(html).not.toContain("You are a writer.");
  });

  test("shows only the persona of a guide without a summary", () => {
    expect(html).toContain(">The researcher<");
    expect(html).not.toContain("You are a researcher.");
  });

  test("asks the reader to pick from a section with several guides", () => {
    const use = html.slice(0, html.indexOf(">Run a brain</h2>"));

    expect(use).toContain(">Which one are you?</h3>");
  });

  test("offers a section's single guide as a walk-through", () => {
    const run = html.slice(
      html.indexOf(">Run a brain</h2>"),
      html.indexOf(">Extend a brain</h2>"),
    );

    expect(run).toContain(">Walk it through</h3>");
    expect(run).not.toContain(">Which one are you?</h3>");
  });

  test("links each reference doc by its title", () => {
    expect(html).toContain('href="/docs/feature-overview"');
    expect(html).toContain(">Doc feature-overview<");
  });

  test("folds the reference beyond four docs into a disclosure", () => {
    const [shown, folded] = html.split("<details");

    expect(shown).toContain('href="/docs/d"');
    expect(shown).not.toContain('href="/docs/e"');
    expect(folded).toContain("2 more reference docs");
    expect(folded).toContain('href="/docs/f"');
  });

  test("leaves the guides label out of a section without guides", () => {
    const extend = html.slice(html.indexOf(">Extend a brain</h2>"));

    expect(extend).not.toContain(">Walk it through<");
    expect(extend).not.toContain(">Which one are you?<");
  });

  test("draws nothing without sections", () => {
    expect(render(<GuideSectionsTemplate sections={[]} />)).toBe("");
  });

  test("is registered against the guides-with-docs data source", () => {
    const template = getTemplates()["guide-sections"];

    expect(template?.dataSourceId).toBe("guides:sections");
    expect(template?.requiredPermission).toBe("public");
  });
});

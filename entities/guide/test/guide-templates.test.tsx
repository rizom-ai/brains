/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  GuideBandTemplate,
  GuideDetailTemplate,
  GuideListTemplate,
} from "../src";
import { getTemplates } from "../src/lib/register-templates";
import { guidePageScript } from "../src/templates/guide-page-script";
import { guideWithData, writerGuide } from "./fixtures";

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

const researcher = guideWithData("researcher", 20, "personal");

describe("GuideDetailTemplate", () => {
  const html = render(
    <GuideDetailTemplate
      guide={writerGuide()}
      otherGuides={[researcher, guideWithData("self-hosting", 50)]}
    />,
  );

  test("renders inside the docs chrome, under the current Guides link", () => {
    expect(html).toContain("docs-handbook");
    expect(html).toContain("docs-header");
    expect(html).toMatch(/<a[^>]*href="\/guides"[^>]*aria-current="page"/);
  });

  test("opens with the guide's place, title and who it is for", () => {
    expect(html).toContain("Guide I of III");
    expect(html).toContain("The writer");
    expect(html).toMatch(/Moving in as a <em[^>]*>writer<\/em>/);
    expect(html).toContain("You have years of essays and a folder of drafts.");
  });

  test("scatters the material as decorative fragments", () => {
    expect(html).toMatch(/class="guide-fragments" aria-hidden="true"/);
    expect(count(html, 'class="guide-fragment"')).toBe(5);
    expect(html).toContain("Substack");
  });

  test("maps each source onto one pill per entity type", () => {
    expect(count(html, 'data-guide-source="note"')).toBe(2);
    expect(count(html, 'data-guide-source="post"')).toBe(1);
    expect(count(html, 'data-guide-type="note"')).toBe(1);
    expect(count(html, 'data-guide-type="post"')).toBe(1);
    expect(html).toContain("Upload in chat; the original address stays");
    expect(html).toContain("→ note");
  });

  test("names the recipe, what it brings and the welcome email's doors", () => {
    expect(html).toContain("data-guide-start");
    expect(html).toMatch(/The <em[^>]*>professional<\/em> recipe/);
    expect(html).toContain("A publishing queue with drafts and schedules");
    expect(html).toContain("Chat");
    expect(html).toContain("Studio");
    expect(html).toContain("AI tools");
    expect(html).toContain('href="/guides/self-hosting"');
  });

  test("shows the guide's own highlights instead of the recipe's", () => {
    const guide = writerGuide();
    const fields = {
      ...guide.metadata,
      brings: ["Your profile, as the site and its answers start from it"],
    };
    const own = render(
      <GuideDetailTemplate
        guide={{ ...guide, metadata: fields, frontmatter: fields }}
        otherGuides={[]}
      />,
    );

    expect(own).toMatch(/The <em[^>]*>professional<\/em> recipe/);
    expect(own).toContain(
      "<li>Your profile, as the site and its answers start from it</li>",
    );
    expect(own).not.toContain("A publishing queue with drafts and schedules");
  });

  test("leaves out the start section for a guide without a recipe", () => {
    const plain = render(
      <GuideDetailTemplate
        guide={guideWithData("self-hosting", 50)}
        otherGuides={[]}
      />,
    );
    expect(plain).not.toContain("data-guide-start");
    expect(plain).not.toContain('href="/guides/self-hosting"');
  });

  test("renders each stage as a numbered chapter with its prose", () => {
    expect(html).toContain("One stage, and then a week.");
    expect(html).toMatch(/<h3[^>]*>Bring your drafts in<\/h3>/);
    expect(html).toMatch(/<h3[^>]*>A week later<\/h3>/);
    expect(html).toContain('id="bring-your-drafts-in"');
    expect(html).toContain(">01<");
    expect(html).toContain(">02<");
    expect(html).toContain("<strong>notes</strong>");
  });

  test("shows the Exact steps links as chips and drops the line", () => {
    expect(html).toContain('href="/docs/interface-setup"');
    expect(html).toContain('href="/docs/content-management"');
    expect(html).toContain('href="/docs/feature-overview"');
    expect(count(html, 'class="guide-chip"')).toBe(3);
    expect(html).not.toContain("Exact steps:");
  });

  test("sets a stage's closing list beside its prose", () => {
    expect(html).toContain('class="guide-points"');
    expect(html).toContain("<strong>Answers from your work:</strong>");
  });

  test("lists the stages on a rail that links to them", () => {
    expect(html).toContain('href="#bring-your-drafts-in"');
    expect(html).toContain('href="#a-week-later"');
  });

  test("closes with a card for each other guide", () => {
    expect(html).toContain('href="/guides/researcher"');
    expect(html).toContain('href="/guides/self-hosting"');
    expect(html).toContain("Not quite a writer?");
    expect(html).toContain("Guide II");
    expect(html).toContain("recipe · personal");
    expect(html).toContain("any recipe");
    expect(count(html, 'class="guide-card guide-reveal"')).toBe(2);
  });
});

describe("guide-detail template", () => {
  test("ships the page script as a deferred runtime script", () => {
    const template = getTemplates()["guide-detail"];
    const src = template?.runtimeScripts?.[0]?.src;

    expect(src).toBe("/scripts/guide-page.js");
    expect(template?.runtimeScripts?.[0]?.defer).toBe(true);
    expect(template?.staticAssets?.[src ?? ""]).toBe(guidePageScript);
  });

  test("the script enhances the page it renders", () => {
    expect(guidePageScript).toContain("[data-guide-page]");
    expect(guidePageScript).toContain("prefers-reduced-motion");
    expect(guidePageScript).toContain("IntersectionObserver");
    expect(guidePageScript).toContain("data-guide-source");
    expect(guidePageScript).toContain("data-guide-rail");
  });
});

/** The card titles in the order they appear. */
function cardTitles(html: string): string[] {
  return [
    ...html.matchAll(/<a class="guide-card[^"]*"[^>]*>.*?<h3>(.*?)<\/h3>/g),
  ].map((match) => match[1] ?? "");
}

const unordered = [
  guideWithData("self-hosting", 50),
  guideWithData("writer", 10, "professional"),
  guideWithData("researcher", 20, "personal"),
];

describe("GuideListTemplate", () => {
  const html = render(<GuideListTemplate guides={unordered} />);

  test("renders inside the docs chrome, under the current Guides link", () => {
    expect(html).toContain("docs-header");
    expect(html).toMatch(/<a[^>]*href="\/guides"[^>]*aria-current="page"/);
    expect(html).toContain("themeToggle");
  });

  test("opens with what the guides are", () => {
    expect(html).toMatch(/<p class="guide-label">Moving in<\/p>/);
    expect(html).toMatch(/<h1 class="guide-display">/);
    expect(html).toContain(
      "One guide for each kind of user, and one for running your own brain.",
    );
  });

  test("shows one card per guide, by order, numbered from I", () => {
    expect(cardTitles(html)).toEqual([
      "The writer",
      "The researcher",
      "The self-hosting",
    ]);
    expect(html).toMatch(/Guide I<\/p><h3>The writer/);
    expect(html).toMatch(/Guide III<\/p><h3>The self-hosting/);
  });

  test("each card links its guide and says who it is for and its recipe", () => {
    expect(html).toContain('href="/guides/writer"');
    expect(html).toContain('href="/guides/self-hosting"');
    expect(html).toContain("You are a researcher.");
    expect(html).toContain("recipe · professional");
    expect(html).toContain("recipe · personal");
    expect(html).toContain("any recipe");
  });
});

describe("GuideBandTemplate", () => {
  test("renders nothing without guides", () => {
    expect(render(<GuideBandTemplate guides={[]} />)).toBe("");
  });

  test("lists the guides by order as a band in the docs column", () => {
    const html = render(<GuideBandTemplate guides={unordered} />);

    expect(html).toContain("docs-handbook--continued");
    expect(html).not.toContain("docs-header");
    expect(html).toMatch(/<p class="guide-label">Moving in<\/p>/);
    expect(cardTitles(html)).toEqual([
      "The writer",
      "The researcher",
      "The self-hosting",
    ]);
    expect(html).toContain("recipe · professional");
    expect(html).toContain("any recipe");
  });
});

describe("guide-band template", () => {
  test("reads the guides list from the guides data source", () => {
    const template = getTemplates()["guide-band"];

    expect(template?.dataSourceId).toBe("guides:entities");
    expect(template?.requiredPermission).toBe("public");
  });
});

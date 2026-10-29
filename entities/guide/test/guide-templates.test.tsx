/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { GuideDetailTemplate, GuideListTemplate } from "../src";
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

  test("renders inside the docs chrome", () => {
    expect(html).toContain("docs-handbook");
    expect(html).toContain("docs-header");
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

describe("GuideListTemplate", () => {
  test("links each guide at its slug", () => {
    const html = render(
      <GuideListTemplate
        guides={[guideWithData("writer", 10), guideWithData("team", 40)]}
      />,
    );

    expect(html).toContain('href="/guides/writer"');
    expect(html).toContain('href="/guides/team"');
    expect(html).toContain("You are a team.");
  });
});

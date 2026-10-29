/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { GuideDetailTemplate, GuideListTemplate } from "../src";
import { guideWithData } from "./fixtures";

describe("GuideDetailTemplate", () => {
  const html = render(
    <GuideDetailTemplate
      guide={guideWithData("writer", 10)}
      otherGuides={[guideWithData("team", 40)]}
    />,
  );

  test("renders inside the docs chrome", () => {
    expect(html).toContain("docs-handbook");
    expect(html).toContain("docs-header");
  });

  test("opens with the title and who the guide is for", () => {
    expect(html).toContain("Moving in as writer");
    expect(html).toContain("You are a writer.");
  });

  test("renders the markdown body", () => {
    expect(html).toContain("Text for writer.");
    expect(html).toMatch(/<h2[^>]*>Start<\/h2>/);
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

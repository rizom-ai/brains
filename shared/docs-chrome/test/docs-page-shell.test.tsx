/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { DocsPageShell } from "../src";

describe("DocsPageShell", () => {
  test("wraps the page in the docs header, styles and handbook frame", () => {
    const html = render(
      <DocsPageShell title="Guides" description="Moving in">
        <p>Body</p>
      </DocsPageShell>,
    );

    expect(html).toContain('class="docs-handbook"');
    expect(html).toContain("docs-header");
    expect(html).toContain("--docs-accent");
    expect(html).toContain("<p>Body</p>");
    expect(html).not.toContain("themeToggle");
  });

  test("adds the detail frame and footer when asked", () => {
    const html = render(
      <DocsPageShell title="Guide" description="One guide" detail footer>
        <p>Body</p>
      </DocsPageShell>,
    );

    expect(html).toContain("docs-handbook docs-handbook--detail");
    expect(html).toContain("themeToggle");
  });
});

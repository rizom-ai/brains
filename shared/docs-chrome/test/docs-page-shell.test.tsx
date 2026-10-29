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

  test("the footer's theme toggle is bound by the page and names the other theme", () => {
    const html = render(
      <DocsPageShell title="Guide" description="One guide" footer>
        <p>Body</p>
      </DocsPageShell>,
    );

    expect(html).toMatch(/<button[^>]*data-theme-toggle/);
    expect(html).toContain("☀ Light");
    expect(html).toContain("☾ Dark");
    expect(html).toContain('[data-theme="light"] .docs-theme-toggle__light');
  });

  test("leaves a full-bleed page unwrapped and keeps the footer in the column", () => {
    const html = render(
      <DocsPageShell title="Guide" description="One guide" bleed footer>
        <p>Body</p>
      </DocsPageShell>,
    );

    expect(html).toMatch(
      /docs-header.*?<\/nav><p>Body<\/p><div class="mx-auto/,
    );
    expect(html).toMatch(/<div class="mx-auto[^"]*"><footer/);
  });
});

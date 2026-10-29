/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { DocsPageSection, DocsPageShell } from "../src";

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

describe("docs header", () => {
  test("links the guides index next to the roadmap", () => {
    const html = render(
      <DocsPageShell title="Docs" description="Docs">
        <p>Body</p>
      </DocsPageShell>,
    );

    expect(html).toMatch(/<a[^>]*href="\/guides"[^>]*>Guides<\/a>.*?Roadmap/);
    expect(html).not.toMatch(/<a[^>]*aria-current="page"/);
  });

  test("marks the guides link current on guide pages", () => {
    const html = render(
      <DocsPageShell title="Guide" description="One guide" current="guides">
        <p>Body</p>
      </DocsPageShell>,
    );

    expect(html).toMatch(
      /<a[^>]*href="\/guides"[^>]*aria-current="page"[^>]*>Guides<\/a>/,
    );
  });
});

describe("composed docs pages", () => {
  test("a shell that continues in later sections drops its full height", () => {
    const html = render(
      <DocsPageShell title="Docs" description="Docs" continues>
        <p>Hero</p>
      </DocsPageShell>,
    );

    expect(html).toContain('class="docs-handbook docs-handbook--continued"');
    expect(html).toContain("docs-header");
  });

  test("a later section keeps the docs tokens and column, without the header", () => {
    const html = render(
      <DocsPageSection>
        <p>Band</p>
      </DocsPageSection>,
    );

    expect(html).toMatch(
      /^<div class="docs-handbook docs-handbook--continued"><div class="mx-auto max-w-6xl px-6 md:px-12"><p>Band<\/p><\/div><\/div>$/,
    );
  });
});

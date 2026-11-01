/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  DocsPageSection,
  DocsPageShell,
  docsChromeSchema,
  type DocsChrome,
} from "../src";

const chrome: DocsChrome = docsChromeSchema.parse({
  brand: {
    label: "Handbook docs",
    href: "/docs",
    wordmark: { ink: "handbook", suffix: "docs" },
  },
  links: [
    { label: "Guides", href: "/guides", area: "guides" },
    { label: "Roadmap", href: "/docs/roadmap" },
  ],
  cta: { label: "Get started", href: "https://example.com" },
  footer: {
    brand: { label: "Example", href: "https://example.com" },
    links: [{ label: "Guides", href: "/guides" }],
  },
});

describe("DocsPageShell", () => {
  test("wraps the page in the docs styles and handbook frame", () => {
    const html = render(
      <DocsPageShell title="Guides" description="Moving in">
        <p>Body</p>
      </DocsPageShell>,
    );

    expect(html).toContain('class="docs-handbook"');
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
      <DocsPageShell
        title="Guide"
        description="One guide"
        chrome={chrome}
        bleed
        footer
      >
        <p>Body</p>
      </DocsPageShell>,
    );

    expect(html).toMatch(
      /docs-header.*?<\/nav><p>Body<\/p><div class="mx-auto/,
    );
    expect(html).toMatch(/<div class="mx-auto[^"]*"><footer/);
  });
});

describe("docs chrome", () => {
  test("draws no header and no links of its own without a chrome", () => {
    const html = render(
      <DocsPageShell title="Docs" description="Docs" footer>
        <p>Body</p>
      </DocsPageShell>,
    );

    expect(html).not.toContain('class="docs-header');
    expect(html).not.toContain("<nav");
    expect(html).not.toMatch(/<a /);
    expect(html).not.toMatch(/Brains docs|Get Brains/);
    expect(html).not.toContain("rizom");
    expect(html).toContain("themeToggle");
  });

  test("draws the configured brand, links and call to action in the header", () => {
    const html = render(
      <DocsPageShell title="Docs" description="Docs" chrome={chrome}>
        <p>Body</p>
      </DocsPageShell>,
    );

    expect(html).toContain("docs-header");
    expect(html).toMatch(
      /<a[^>]*href="\/docs"[^>]*aria-label="Handbook docs"[^>]*><span[^>]*>handbook<\/span><span[^>]*>\.<\/span><span[^>]*>docs<\/span><\/a>/,
    );
    expect(html).toMatch(/<a[^>]*href="\/guides"[^>]*>Guides<\/a>.*?Roadmap/);
    expect(html).toMatch(
      /<a[^>]*href="https:\/\/example.com"[^>]*>Get started<\/a>/,
    );
    expect(html).not.toMatch(/<a[^>]*aria-current="page"/);
  });

  test("names the brand in plain text when it has no wordmark", () => {
    const html = render(
      <DocsPageShell
        title="Docs"
        description="Docs"
        chrome={docsChromeSchema.parse({
          brand: { label: "42workspace", href: "/" },
        })}
      >
        <p>Body</p>
      </DocsPageShell>,
    );

    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>42workspace<\/a>/);
  });

  test("marks the link of the page's area current", () => {
    const html = render(
      <DocsPageShell
        title="Guide"
        description="One guide"
        chrome={chrome}
        current="guides"
      >
        <p>Body</p>
      </DocsPageShell>,
    );

    expect(html).toMatch(
      /<a[^>]*href="\/guides"[^>]*aria-current="page"[^>]*>Guides<\/a>/,
    );
  });

  test("draws the configured footer brand and links beside the theme toggle", () => {
    const html = render(
      <DocsPageShell
        title="Guide"
        description="One guide"
        chrome={chrome}
        footer
      >
        <p>Body</p>
      </DocsPageShell>,
    );

    const footer = html.split("<footer")[1] ?? "";
    expect(footer).toMatch(
      /<a[^>]*href="https:\/\/example.com"[^>]*>Example<\/a>/,
    );
    expect(footer).toMatch(/<a[^>]*href="\/guides"[^>]*>Guides<\/a>/);
    expect(footer).toContain("themeToggle");
  });
});

describe("composed docs pages", () => {
  test("a shell that continues in later sections drops its full height", () => {
    const html = render(
      <DocsPageShell title="Docs" description="Docs" chrome={chrome} continues>
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

describe("docs link colors", () => {
  test("the link reset yields to the links' own color utilities", () => {
    const html = render(
      <DocsPageShell
        title="Guide"
        description="One guide"
        chrome={chrome}
        current="guides"
      >
        <p>Body</p>
      </DocsPageShell>,
    );

    // Unlayered CSS beats every Tailwind layer, so a bare reset would paint
    // the muted header links and the current one alike in full text color.
    expect(html).toMatch(
      /@layer base \{\s*\.docs-handbook a \{\s*color: inherit;/,
    );
    expect(html).not.toMatch(/(^|\n)\.docs-handbook a \{/);
    expect(html).toMatch(
      /<a class="[^"]*text-\[var\(--docs-text-muted\)\][^"]*aria-\[current=page\]:text-\[var\(--docs-text\)\][^"]*" href="\/guides" aria-current="page"/,
    );
  });
});

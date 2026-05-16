import { describe, it, expect } from "bun:test";
import { markdownToHtml } from "./markdown-html";

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

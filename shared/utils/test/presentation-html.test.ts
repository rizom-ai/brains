import { describe, it, expect } from "bun:test";
import { convertMermaidBlocks } from "../src/presentation-html";

describe("convertMermaidBlocks", () => {
  it("should convert mermaid code blocks to divs", () => {
    const html =
      '<pre><code class="language-mermaid">graph TD\nA--&gt;B</code></pre>';
    const result = convertMermaidBlocks(html);
    expect(result).toBe('<div class="mermaid">graph TD\nA-->B</div>');
  });

  it("should unescape HTML entities inside mermaid blocks", () => {
    const html =
      '<pre><code class="language-mermaid">A--&gt;B\nB--&gt;C\nC&lt;--D</code></pre>';
    const result = convertMermaidBlocks(html);
    expect(result).toContain("A-->B");
    expect(result).toContain("C<--D");
  });

  it("should not modify non-mermaid code blocks", () => {
    const html =
      '<pre><code class="language-javascript">const x = 1;</code></pre>';
    const result = convertMermaidBlocks(html);
    expect(result).toBe(html);
  });

  it("should handle multiple mermaid blocks", () => {
    const html = [
      '<pre><code class="language-mermaid">graph TD\nA--&gt;B</code></pre>',
      "<p>Some text</p>",
      '<pre><code class="language-mermaid">sequenceDiagram\nA-&gt;&gt;B: Hello</code></pre>',
    ].join("\n");
    const result = convertMermaidBlocks(html);
    expect(result).toContain('<div class="mermaid">graph TD\nA-->B</div>');
    expect(result).toContain(
      '<div class="mermaid">sequenceDiagram\nA->>B: Hello</div>',
    );
    expect(result).toContain("<p>Some text</p>");
  });

  it("should handle empty mermaid block", () => {
    const html = '<pre><code class="language-mermaid"></code></pre>';
    const result = convertMermaidBlocks(html);
    expect(result).toBe('<div class="mermaid"></div>');
  });

  it("should pass through html without any code blocks", () => {
    const html = "<p>Just a paragraph</p>";
    const result = convertMermaidBlocks(html);
    expect(result).toBe(html);
  });
});

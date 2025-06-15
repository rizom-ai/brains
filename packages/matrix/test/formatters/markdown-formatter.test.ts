import { describe, it, expect, beforeEach } from "bun:test";
import { MarkdownFormatter } from "../../src/formatters/markdown-formatter";

describe("MarkdownFormatter", () => {
  let formatter: MarkdownFormatter;

  beforeEach(() => {
    formatter = new MarkdownFormatter();
  });

  describe("markdownToHtml", () => {
    it("should convert basic markdown to HTML", () => {
      const markdown = "**Bold** and *italic* text";
      const html = formatter.markdownToHtml(markdown);
      expect(html).toContain("<strong>Bold</strong>");
      expect(html).toContain("<em>italic</em>");
    });

    it("should convert headers", () => {
      const markdown = "# Header 1\n## Header 2";
      const html = formatter.markdownToHtml(markdown);
      expect(html).toContain("<h1>Header 1</h1>");
      expect(html).toContain("<h2>Header 2</h2>");
    });

    it("should convert code blocks", () => {
      const markdown = "```javascript\nconst x = 42;\n```";
      const html = formatter.markdownToHtml(markdown);
      // Check for either language-javascript or language-text as marked might not detect the language
      expect(html).toMatch(/<pre><code class="language-(javascript|text)">/);
      expect(html).toContain("const x = 42;");
    });

    it("should convert links", () => {
      const markdown = "[Link text](https://example.com)";
      const html = formatter.markdownToHtml(markdown);
      expect(html).toContain('<a href="https://example.com">Link text</a>');
    });

    it("should convert lists", () => {
      const markdown = "- Item 1\n- Item 2\n\n1. First\n2. Second";
      const html = formatter.markdownToHtml(markdown);
      expect(html).toContain("<ul>");
      expect(html).toContain("<li>Item 1</li>");
      expect(html).toContain("<ol>");
      expect(html).toContain("<li>First</li>");
    });
  });

  describe("markdownToPlainText", () => {
    it("should strip markdown formatting", () => {
      const markdown = "**Bold** and *italic* text with `code`";
      const plain = formatter.markdownToPlainText(markdown);
      expect(plain).toBe("Bold and italic text with code");
    });

    it("should strip headers", () => {
      const markdown = "# Header 1\n## Header 2\nNormal text";
      const plain = formatter.markdownToPlainText(markdown);
      expect(plain).toBe("Header 1\nHeader 2\nNormal text");
    });

    it("should strip links but keep text", () => {
      const markdown = "Check out [this link](https://example.com) for more";
      const plain = formatter.markdownToPlainText(markdown);
      expect(plain).toBe("Check out this link for more");
    });

    it("should convert list markers", () => {
      const markdown = "- Item 1\n- Item 2\n* Item 3";
      const plain = formatter.markdownToPlainText(markdown);
      expect(plain).toBe("• Item 1\n• Item 2\n• Item 3");
    });

    it("should strip code blocks", () => {
      const markdown = "Here's code:\n```javascript\nconst x = 42;\n```\nDone!";
      const plain = formatter.markdownToPlainText(markdown);
      expect(plain).toBe("Here's code:\nconst x = 42;\n\nDone!");
    });
  });

  describe("formatCodeBlock", () => {
    it("should format code block with language", () => {
      const result = formatter.formatCodeBlock("const x = 42;", "javascript");
      expect(result.text).toBe("```javascript\nconst x = 42;\n```");
      expect(result.html).toContain('<pre><code class="language-javascript">');
    });

    it("should format code block without language", () => {
      const result = formatter.formatCodeBlock("some code");
      expect(result.text).toBe("```text\nsome code\n```");
      expect(result.html).toContain('<pre><code class="language-text">');
    });
  });

  describe("formatList", () => {
    it("should format unordered list", () => {
      const items = ["First", "Second", "Third"];
      const result = formatter.formatList(items);
      expect(result.text).toBe("• First\n• Second\n• Third");
      expect(result.html).toBe(
        "<ul><li>First</li><li>Second</li><li>Third</li></ul>",
      );
    });

    it("should format ordered list", () => {
      const items = ["First", "Second", "Third"];
      const result = formatter.formatList(items, true);
      expect(result.text).toBe("1. First\n2. Second\n3. Third");
      expect(result.html).toBe(
        "<ol><li>First</li><li>Second</li><li>Third</li></ol>",
      );
    });
  });

  describe("formatBlockquote", () => {
    it("should format single line blockquote", () => {
      const result = formatter.formatBlockquote("This is a quote");
      expect(result.text).toBe("> This is a quote");
      expect(result.html).toBe("<blockquote>This is a quote</blockquote>");
    });

    it("should format multi-line blockquote", () => {
      const result = formatter.formatBlockquote("Line 1\nLine 2");
      expect(result.text).toBe("> Line 1\n> Line 2");
      expect(result.html).toBe("<blockquote>Line 1\nLine 2</blockquote>");
    });
  });

  describe("formatBold", () => {
    it("should format bold text", () => {
      const result = formatter.formatBold("Important");
      expect(result.text).toBe("**Important**");
      expect(result.html).toBe("<strong>Important</strong>");
    });
  });

  describe("formatItalic", () => {
    it("should format italic text", () => {
      const result = formatter.formatItalic("Emphasis");
      expect(result.text).toBe("*Emphasis*");
      expect(result.html).toBe("<em>Emphasis</em>");
    });
  });

  describe("formatLink", () => {
    it("should format link", () => {
      const result = formatter.formatLink("Click here", "https://example.com");
      expect(result.text).toBe("[Click here](https://example.com)");
      expect(result.html).toBe('<a href="https://example.com">Click here</a>');
    });
  });

  describe("HTML escaping", () => {
    it("should escape HTML in code blocks", () => {
      const result = formatter.formatCodeBlock('<script>alert("XSS")</script>');
      expect(result.html).toContain("&lt;script&gt;");
      expect(result.html).not.toContain("<script>");
    });

    it("should escape HTML in formatted text", () => {
      const result = formatter.formatBold('<script>alert("XSS")</script>');
      expect(result.html).toContain("&lt;script&gt;");
      expect(result.html).not.toContain("<script>");
    });
  });
});

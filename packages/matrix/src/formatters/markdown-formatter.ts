import { marked } from "marked";

/**
 * Formats markdown content for Matrix messages
 */
export class MarkdownFormatter {
  constructor() {
    // Configure marked options
    marked.setOptions({
      gfm: true,
      breaks: true,
      pedantic: false,
    });
  }

  /**
   * Convert markdown to HTML for Matrix formatted messages
   */
  markdownToHtml(markdown: string): string {
    return marked(markdown) as string;
  }

  /**
   * Convert markdown to plain text (strip formatting)
   */
  markdownToPlainText(markdown: string): string {
    // Remove common markdown syntax
    return (
      markdown
        // Headers
        .replace(/^#{1,6}\s+/gm, "")
        // Bold
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/__([^_]+)__/g, "$1")
        // Italic
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/_([^_]+)_/g, "$1")
        // Links
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        // Images
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
        // Code blocks
        .replace(/```[^`]*```/g, (match) => {
          return match.replace(/```\w*\n?/g, "").replace(/\n?```$/g, "");
        })
        // Inline code
        .replace(/`([^`]+)`/g, "$1")
        // Blockquotes
        .replace(/^>\s+/gm, "")
        // Lists
        .replace(/^[*\-+]\s+/gm, "• ")
        .replace(/^\d+\.\s+/gm, "")
        // Horizontal rules
        .replace(/^[*\-_]{3,}$/gm, "---")
        // Extra whitespace
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    );
  }

  /**
   * Format a code block with syntax highlighting
   */
  formatCodeBlock(
    code: string,
    language?: string,
  ): { text: string; html: string } {
    const lang = language ?? "text";
    const text = `\`\`\`${lang}\n${code}\n\`\`\``;
    const html = `<pre><code class="language-${lang}">${this.escapeHtml(code)}</code></pre>`;
    return { text, html };
  }

  /**
   * Format a list
   */
  formatList(items: string[], ordered = false): { text: string; html: string } {
    const textItems = items.map((item, i) =>
      ordered ? `${i + 1}. ${item}` : `• ${item}`,
    );
    const text = textItems.join("\n");

    const htmlItems = items.map((item) => `<li>${this.escapeHtml(item)}</li>`);
    const html = ordered
      ? `<ol>${htmlItems.join("")}</ol>`
      : `<ul>${htmlItems.join("")}</ul>`;

    return { text, html };
  }

  /**
   * Format a blockquote
   */
  formatBlockquote(content: string): { text: string; html: string } {
    const text = content
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    const html = `<blockquote>${this.escapeHtml(content)}</blockquote>`;
    return { text, html };
  }

  /**
   * Format bold text
   */
  formatBold(content: string): { text: string; html: string } {
    return {
      text: `**${content}**`,
      html: `<strong>${this.escapeHtml(content)}</strong>`,
    };
  }

  /**
   * Format italic text
   */
  formatItalic(content: string): { text: string; html: string } {
    return {
      text: `*${content}*`,
      html: `<em>${this.escapeHtml(content)}</em>`,
    };
  }

  /**
   * Format a link
   */
  formatLink(text: string, url: string): { text: string; html: string } {
    return {
      text: `[${text}](${url})`,
      html: `<a href="${this.escapeHtml(url)}">${this.escapeHtml(text)}</a>`,
    };
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    if (!text || typeof text !== "string") {
      return "";
    }
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m] ?? m);
  }
}

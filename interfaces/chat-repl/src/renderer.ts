import chalk from "chalk";
import { marked, type Tokens } from "marked";

/**
 * Custom marked renderer that outputs styled terminal text using chalk
 * This is different from markdownToHtml in utils - we need terminal formatting, not HTML
 */
class TerminalRenderer extends marked.Renderer {
  // Block elements
  override heading({ tokens, depth }: Tokens.Heading): string {
    const text = this.parser.parseInline(tokens);
    const levels = ["#", "##", "###", "####", "#####", "######"];
    const prefix = chalk.cyan(levels[depth - 1]);
    return `\n${prefix} ${chalk.bold(text)}\n`;
  }

  override paragraph({ tokens }: Tokens.Paragraph): string {
    const text = this.parser.parseInline(tokens);
    // Color entity ID lines that start with [ID]
    let coloredText = text.replace(/^\[([^\]]+)\]/, (_match, id) => {
      return chalk.cyan.bold(`[${id}]`);
    });

    // Wrap text if it's longer than 80 characters and not just an ID line
    if (coloredText.length > 80 && !coloredText.startsWith("[")) {
      coloredText = this.wrapText(coloredText, 80);
    }

    return `${coloredText}\n\n`;
  }

  private wrapText(text: string, width: number): string {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= width) {
        currentLine = currentLine ? `${currentLine} ${word}` : word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          lines.push(word); // Word longer than width
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.join("\n");
  }

  override code({ text, lang: language }: Tokens.Code): string {
    const lang = language ?? "text";
    const header = chalk.gray(`┌─ ${lang} ${"─".repeat(47 - lang.length)}┐`);
    const footer = chalk.gray(`└${"─".repeat(50)}┘`);
    const lines = text.split("\n").map((line) => chalk.gray("│ ") + line);
    return `${header}\n${lines.join("\n")}\n${footer}\n`;
  }

  override blockquote({ tokens }: Tokens.Blockquote): string {
    const quote = this.parser.parse(tokens);
    const lines = quote.trim().split("\n");
    return (
      lines.map((line) => chalk.gray("│ ") + chalk.italic(line)).join("\n") +
      "\n"
    );
  }

  override list({ items }: Tokens.List): string {
    return items.map((item) => this.listitem(item)).join("") + "\n";
  }

  override listitem({ tokens }: Tokens.ListItem): string {
    // Remove any trailing newline from the text
    const cleanText = this.parser.parse(tokens).trimEnd();
    const bullet = chalk.cyan("•");
    return `  ${bullet} ${cleanText}\n`;
  }

  override hr(): string {
    return chalk.gray("─".repeat(50)) + "\n";
  }

  override br(): string {
    return "\n";
  }

  // Inline elements
  override strong({ tokens }: Tokens.Strong): string {
    return chalk.bold(this.parser.parseInline(tokens));
  }

  override em({ tokens }: Tokens.Em): string {
    return chalk.italic(this.parser.parseInline(tokens));
  }

  override codespan({ text }: Tokens.Codespan): string {
    return chalk.bgGray.white(` ${text} `);
  }

  override link({ href, tokens }: Tokens.Link): string {
    const text = this.parser.parseInline(tokens);
    return chalk.blue.underline(text) + chalk.gray(` (${href})`);
  }

  // Pass through for unsupported elements
  override image({ text }: Tokens.Image): string {
    return `[${text}]`;
  }

  override text({ text }: Tokens.Text | Tokens.Escape): string {
    return text;
  }
}

/**
 * Renders markdown as styled terminal text using chalk
 */
export class CLIMarkdownRenderer {
  private renderer: TerminalRenderer;

  constructor() {
    this.renderer = new TerminalRenderer();
  }

  render(markdown: string): string {
    // Configure marked with our custom renderer
    const options = {
      renderer: this.renderer,
      gfm: true,
      breaks: true,
      pedantic: false,
    };

    // Parse and render the markdown
    const rendered = marked(markdown, options) as string;

    // Decode HTML entities for clean CLI display
    return this.decodeHtmlEntities(rendered);
  }

  /**
   * Decode HTML entities in text for clean CLI display
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
  }
}

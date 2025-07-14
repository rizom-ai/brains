import chalk from "chalk";
import { marked } from "marked";

/**
 * Custom marked renderer that outputs styled terminal text using chalk
 * This is different from markdownToHtml in utils - we need terminal formatting, not HTML
 */
class TerminalRenderer extends marked.Renderer {
  // Block elements
  override heading(text: string, level: number): string {
    const levels = ["#", "##", "###", "####", "#####", "######"];
    const prefix = chalk.cyan(levels[level - 1]);
    return `\n${prefix} ${chalk.bold(text)}\n`;
  }

  override paragraph(text: string): string {
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

  override code(code: string, language?: string): string {
    const lang = language ?? "text";
    const header = chalk.gray(`┌─ ${lang} ${"─".repeat(47 - lang.length)}┐`);
    const footer = chalk.gray(`└${"─".repeat(50)}┘`);
    const lines = code.split("\n").map((line) => chalk.gray("│ ") + line);
    return `${header}\n${lines.join("\n")}\n${footer}\n`;
  }

  override blockquote(quote: string): string {
    const lines = quote.trim().split("\n");
    return (
      lines.map((line) => chalk.gray("│ ") + chalk.italic(line)).join("\n") +
      "\n"
    );
  }

  override list(body: string, _ordered: boolean): string {
    return body + "\n";
  }

  override listitem(text: string, _task: boolean, _checked: boolean): string {
    // Remove any trailing newline from the text
    const cleanText = text.trimEnd();
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
  override strong(text: string): string {
    return chalk.bold(text);
  }

  override em(text: string): string {
    return chalk.italic(text);
  }

  override codespan(code: string): string {
    return chalk.bgGray.white(` ${code} `);
  }

  override link(href: string, _title: string | null, text: string): string {
    return chalk.blue.underline(text) + chalk.gray(` (${href})`);
  }

  // Pass through for unsupported elements
  override image(_href: string, _title: string | null, text: string): string {
    return `[${text}]`;
  }

  override text(text: string): string {
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
      mangle: false,
      headerIds: false,
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

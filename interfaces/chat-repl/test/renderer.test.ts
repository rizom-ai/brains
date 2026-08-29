import { afterEach, describe, expect, it } from "bun:test";
import chalk from "chalk";
import { CLIMarkdownRenderer } from "../src/renderer";

const initialColorLevel = chalk.level;

function render(markdown: string, colorLevel: 0 | 1 = 0): string {
  chalk.level = colorLevel;
  return new CLIMarkdownRenderer().render(markdown);
}

afterEach(() => {
  chalk.level = initialColorLevel;
});

describe("CLIMarkdownRenderer", () => {
  it("styles headings and inline emphasis when terminal color is enabled", () => {
    const output = render("# Heading **bold** *italic*", 1);

    expect(output).toContain("\u001B[36m#\u001B[39m");
    expect(output).toContain("\u001B[1m");
    expect(output).toContain("\u001B[3m");
    expect(Bun.stripANSI(output)).toBe("\n# Heading bold italic\n");
  });

  it("highlights a leading entity ID without changing the rest of the line", () => {
    const output = render("[entity-123] Entity title", 1);

    expect(output).toContain("\u001B[36m\u001B[1m[entity-123]");
    expect(Bun.stripANSI(output)).toBe("[entity-123] Entity title\n\n");
  });

  it("wraps ordinary paragraphs at 80 columns", () => {
    const output = render(
      "This paragraph is deliberately long enough that it should wrap before reaching beyond the configured eighty-column terminal width when rendered.",
    );
    const lines = output.trimEnd().split("\n");

    expect(lines).toEqual([
      "This paragraph is deliberately long enough that it should wrap before reaching",
      "beyond the configured eighty-column terminal width when rendered.",
    ]);
    expect(lines.every((line) => line.length <= 80)).toBe(true);
  });

  it("draws fenced code with its language label", () => {
    const output = render("```ts\nconst x = 1;\n```");

    expect(output).toBe(
      "┌─ ts ─────────────────────────────────────────────┐\n" +
        "│ const x = 1;\n" +
        "└──────────────────────────────────────────────────┘\n",
    );
  });

  it("renders blockquotes, nested lists, rules, links, images, entities, and breaks", () => {
    const output = render(
      "> quoted\n\n- first\n  - nested\n- second\n\n---\n\n[docs](https://example.com) ![diagram](image.png)  \nnext &amp; &lt;tag&gt;",
    );

    expect(output).toContain("│ quoted\n");
    expect(output).toContain("  • first  • nested\n  • second\n");
    expect(output).toContain("─".repeat(50));
    expect(output).toContain("docs (https://example.com) [diagram]\n");
    expect(output).toContain("next & <tag>\n");
    expect(output).not.toContain("&amp;");
    expect(output).not.toContain("&lt;");
  });

  it("emits no ANSI escapes when terminal color is disabled", () => {
    const output = render("## Plain **bold** and *italic*", 0);

    expect(output).toBe(Bun.stripANSI(output));
    expect(output).toBe("\n## Plain bold and italic\n");
  });
});

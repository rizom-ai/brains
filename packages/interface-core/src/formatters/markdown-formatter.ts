import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import { visit } from "unist-util-visit";

export interface FormatOptions {
  preserveFrontmatter?: boolean;
  maxLineLength?: number;
  stripHtml?: boolean;
}

export class MarkdownFormatter {
  private createProcessor() {
    const processor = remark().data("settings", {
      bullet: "-",
      emphasis: "_",
      setext: false,
      listItemIndent: "one",
    });

    if (this.options.preserveFrontmatter) {
      return processor.use(remarkFrontmatter);
    }

    return processor;
  }

  constructor(private readonly options: FormatOptions = {}) {}

  public async format(markdown: string): Promise<string> {
    const result = await this.createProcessor().process(markdown);
    return String(result);
  }

  public async extractText(markdown: string): Promise<string> {
    const tree = remark().parse(markdown);
    const textParts: string[] = [];

    visit(tree, "text", (node) => {
      if ("value" in node && typeof node.value === "string") {
        textParts.push(node.value);
      }
    });

    return textParts.join(" ").trim();
  }

  public async extractCodeBlocks(
    markdown: string,
  ): Promise<Array<{ lang?: string | null; value: string }>> {
    const tree = remark().parse(markdown);
    const codeBlocks: Array<{ lang?: string | null; value: string }> = [];

    visit(tree, "code", (node) => {
      if ("value" in node && typeof node.value === "string") {
        const lang =
          "lang" in node && typeof node.lang === "string" ? node.lang : null;
        codeBlocks.push({
          lang,
          value: node.value,
        });
      }
    });

    return codeBlocks;
  }
}

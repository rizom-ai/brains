import type { ContentFormatter } from "@brains/types";
import * as yaml from "js-yaml";

/**
 * Default YAML formatter for generic content types
 *
 * Formats data as YAML within a markdown code block, making it easy
 * for humans to edit structured data in a familiar format.
 */
export class DefaultYamlFormatter
  implements ContentFormatter<Record<string, unknown>>
{
  protected yaml = yaml;

  format(data: Record<string, unknown>): string {
    const yamlContent = this.yaml
      .dump(data, {
        indent: 2,
        lineWidth: -1, // Disable line wrapping
        sortKeys: false, // Preserve key order
      })
      .trim(); // Trim to handle empty object case

    return `# Content Data

\`\`\`yaml
${yamlContent}
\`\`\`

Edit the YAML above to modify the content.`;
  }

  parse(content: string): Record<string, unknown> {
    // Extract YAML from code block
    const yamlMatch = content.match(/```yaml\n([\s\S]*?)\n```/);
    if (!yamlMatch) {
      throw new Error("No YAML code block found in content");
    }

    const yamlContent = yamlMatch[1];
    if (!yamlContent) {
      throw new Error("YAML code block is empty");
    }

    try {
      const parsed = this.yaml.load(yamlContent);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error("YAML content must be an object");
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      if (error instanceof Error) {
        // If it's our custom error, re-throw as is
        if (error.message === "YAML content must be an object") {
          throw error;
        }
        throw new Error(`Failed to parse YAML: ${error.message}`);
      }
      throw error;
    }
  }
}
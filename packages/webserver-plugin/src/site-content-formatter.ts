import { BaseFormatter } from "@brains/formatters";
import type { SchemaFormatter } from "@brains/types";
import { siteContentSchema } from "./schemas";
import * as yaml from "js-yaml";

export class SiteContentFormatter
  extends BaseFormatter
  implements SchemaFormatter
{
  name = "site-content";

  canFormat(data: unknown): boolean {
    const result = siteContentSchema.safeParse(data);
    return result.success;
  }

  format(data: unknown): string {
    const result = siteContentSchema.safeParse(data);
    if (!result.success) {
      return this.formatError("Invalid site content data");
    }

    const siteContent = result.data;
    const lines: string[] = [];

    // Header
    lines.push(`# Site Content: ${siteContent.page}/${siteContent.section}`);
    lines.push("");

    // Metadata
    lines.push("## Details");
    lines.push(this.formatKeyValue("Page", siteContent.page));
    lines.push(this.formatKeyValue("Section", siteContent.section));
    lines.push(
      this.formatKeyValue(
        "Updated",
        new Date(siteContent.updated).toLocaleString(),
      ),
    );
    lines.push("");

    // Content Data
    lines.push("## Content Data");
    lines.push("```yaml");
    lines.push(yaml.dump(siteContent.data, { indent: 2 }));
    lines.push("```");

    return lines.join("\n");
  }
}

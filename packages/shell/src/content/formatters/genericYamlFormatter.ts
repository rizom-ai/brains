import type { ContentFormatter } from "@brains/types";
import { DefaultYamlFormatter } from "@brains/formatters";

/**
 * Generic YAML formatter that works with any type T
 * Wraps DefaultYamlFormatter to provide type compatibility
 */
export class GenericYamlFormatter<T = unknown> implements ContentFormatter<T> {
  private yamlFormatter = new DefaultYamlFormatter();

  format(data: T): string {
    // Cast to Record<string, unknown> for YAML formatter
    return this.yamlFormatter.format(data as Record<string, unknown>);
  }

  parse(content: string): T {
    // Parse as Record<string, unknown> then cast back to T
    return this.yamlFormatter.parse(content) as T;
  }
}

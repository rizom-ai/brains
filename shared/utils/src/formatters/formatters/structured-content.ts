import type { ContentFormatter } from "../types";
import { z } from "../../zod";
import { remark } from "remark";
import type { Root, Heading, Paragraph, Content, List, ListItem } from "mdast";

/**
 * Field mapping configuration for structured content formatting
 */
export interface FieldMapping {
  /** The data field name (supports dot notation for nested fields) */
  key: string;
  /** The markdown heading label */
  label: string;
  /** The field type */
  type: "string" | "number" | "object" | "array" | "custom";
  /** Child mappings for object types */
  children?: FieldMapping[];
  /** For arrays: the type of each item */
  itemType?: "string" | "number" | "object";
  /** For arrays of objects: mappings for each item's fields */
  itemMappings?: FieldMapping[];
  /** Custom formatter function for the field */
  formatter?: (value: unknown) => string;
  /** Custom parser function for the field */
  parser?: (text: string) => unknown;
}

/**
 * Configuration for the structured content formatter
 */
export interface FormatterConfig {
  /** The main title for the content */
  title: string;
  /** Field mappings that define the structure */
  mappings: FieldMapping[];
}

/**
 * Generic formatter for structured content that uses declarative field mappings
 * to convert between structured data and human-readable markdown.
 */
export class StructuredContentFormatter<T> implements ContentFormatter<T> {
  private processor = remark();

  constructor(
    private schema: z.ZodType<T>,
    private config: FormatterConfig,
  ) {}

  /**
   * Get section labels from the formatter configuration.
   * Returns a record mapping field keys to their heading labels.
   */
  public getLabels(): Record<string, string> {
    const labels: Record<string, string> = {};
    for (const mapping of this.config.mappings) {
      labels[mapping.key] = mapping.label;
    }
    return labels;
  }

  /**
   * Format structured data into human-readable markdown
   */
  public format(data: T): string {
    try {
      const lines: string[] = [`# ${this.config.title}`, ""];

      for (const mapping of this.config.mappings) {
        this.formatField(data, mapping, lines, 2);
      }

      return lines.join("\n");
    } catch {
      throw new Error("Failed to format structured content");
    }
  }

  /**
   * Parse human-readable markdown back to structured data
   */
  public parse(content: string): T {
    try {
      const tree = this.processor.parse(content) as Root;
      const sections = this.extractSections(tree, 2);
      const data = this.buildDataFromSections(sections, this.config.mappings);
      return this.schema.parse(data);
    } catch {
      throw new Error("Failed to parse structured content");
    }
  }

  /**
   * Format a field and add it to the lines array
   */
  private formatField(
    data: unknown,
    mapping: FieldMapping,
    lines: string[],
    depth: number,
  ): void {
    const heading = "#".repeat(depth) + " " + mapping.label;
    const value = this.getValueByPath(data, mapping.key);

    // Use custom formatter if provided
    if (mapping.type === "custom" && mapping.formatter) {
      if (value !== undefined && value !== null) {
        lines.push(heading, "");
        const formatted = mapping.formatter(value);
        if (formatted) {
          lines.push(formatted, "");
        }
      }
      return;
    }

    switch (mapping.type) {
      case "string":
      case "number":
        lines.push(heading, String(value ?? ""), "");
        break;

      case "object":
        lines.push(heading);
        if (mapping.children && value) {
          for (const child of mapping.children) {
            this.formatField(value, child, lines, depth + 1);
          }
        }
        break;

      case "array":
        lines.push(heading, "");
        if (Array.isArray(value)) {
          if (mapping.itemType === "object" && mapping.itemMappings) {
            // Format array of objects with structure
            value.forEach((item, index) => {
              lines.push(
                `${"#".repeat(depth + 1)} ${mapping.label.slice(0, -1)} ${index + 1}`,
              );
              lines.push("");
              // Format each field of the object
              if (mapping.itemMappings) {
                for (const itemMapping of mapping.itemMappings) {
                  this.formatField(item, itemMapping, lines, depth + 2);
                }
              }
            });
          } else {
            // Format simple array items as a list
            for (const item of value) {
              const formatted = this.defaultArrayItemFormat(item);
              lines.push(`- ${formatted}`);
            }
            lines.push("");
          }
        }
        break;
    }
  }

  /**
   * Get a value from an object by dot-notation path
   */
  private getValueByPath(obj: unknown, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Default formatter for array items
   */
  private defaultArrayItemFormat(item: unknown): string {
    if (typeof item === "string" || typeof item === "number") {
      return String(item);
    }
    return JSON.stringify(item);
  }

  /**
   * Extract sections from markdown AST by heading depth
   */
  private extractSections(
    tree: Root,
    targetDepth: number,
  ): Map<string, Content[]> {
    const sections = new Map<string, Content[]>();
    let currentSection: string | null = null;
    let currentContent: Content[] = [];

    for (const node of tree.children) {
      if (node.type === "heading" && node.depth === targetDepth) {
        // Save previous section if exists
        if (currentSection) {
          sections.set(currentSection.toLowerCase(), currentContent);
        }

        // Start new section
        currentSection = this.getHeadingText(node);
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(node);
      }
    }

    // Save last section
    if (currentSection) {
      sections.set(currentSection.toLowerCase(), currentContent);
    }

    return sections;
  }

  /**
   * Extract subsections from content array
   */
  private extractSubsections(
    content: Content[],
    targetDepth: number,
  ): Map<string, Content[]> {
    const subsections = new Map<string, Content[]>();
    let currentSubsection: string | null = null;
    let currentContent: Content[] = [];

    for (const node of content) {
      if (node.type === "heading" && node.depth === targetDepth) {
        // Save previous subsection if exists
        if (currentSubsection) {
          subsections.set(currentSubsection.toLowerCase(), currentContent);
        }

        // Start new subsection
        currentSubsection = this.getHeadingText(node);
        currentContent = [];
      } else if (currentSubsection) {
        currentContent.push(node);
      }
    }

    // Save last subsection
    if (currentSubsection) {
      subsections.set(currentSubsection.toLowerCase(), currentContent);
    }

    return subsections;
  }

  // Zod schema for text node validation
  private readonly textNodeSchema = z.object({
    type: z.literal("text"),
    value: z.string(),
  });

  /**
   * Extract text value from a node safely using Zod
   */
  private extractTextValue(node: unknown): string {
    const parsed = this.textNodeSchema.safeParse(node);
    return parsed.success ? parsed.data.value : "";
  }

  /**
   * Get text content from a heading node
   */
  private getHeadingText(heading: Heading): string {
    const textNodes = heading.children.filter((child) => child.type === "text");
    return textNodes.map((node) => this.extractTextValue(node)).join("");
  }

  /**
   * Build data object from sections based on mappings
   */
  private buildDataFromSections(
    sections: Map<string, Content[]>,
    mappings: FieldMapping[],
    depth: number = 2,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const mapping of mappings) {
      const section = sections.get(mapping.label.toLowerCase());

      // Handle custom parser if provided
      if (mapping.type === "custom" && mapping.parser && section) {
        const textValue = this.getTextFromSection(section);
        const value = mapping.parser(textValue);
        this.setValueByPath(result, mapping.key, value);
      } else if (mapping.type === "object" && mapping.children && section) {
        // Extract subsections for object type
        const subsections = this.extractSubsections(section, depth + 1);
        const objectValue = this.buildDataFromSections(
          subsections,
          mapping.children,
          depth + 1,
        );
        this.setValueByPath(result, mapping.key, objectValue);
      } else if (mapping.type === "array" && section) {
        // Extract array items
        if (mapping.itemType === "object" && mapping.itemMappings) {
          // Extract structured objects from subsections
          const items = this.extractObjectArrayItems(
            section,
            depth + 1,
            mapping.itemMappings,
          );
          this.setValueByPath(result, mapping.key, items);
        } else {
          // Extract simple list items
          const items = this.extractSimpleArrayItems(section);
          this.setValueByPath(result, mapping.key, items);
        }
      } else if (section) {
        // Extract text content for string/number types
        const textValue = this.getTextFromSection(section);
        const value = mapping.type === "number" ? Number(textValue) : textValue;
        this.setValueByPath(result, mapping.key, value);
      }
    }

    return result;
  }

  /**
   * Set a value in an object by dot-notation path
   */
  private setValueByPath(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
  ): void {
    const parts = path.split(".");
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!part) continue;

      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      current[lastPart] = value;
    }
  }

  /**
   * Extract text content from a section
   */
  private getTextFromSection(content: Content[]): string {
    const textParts: string[] = [];

    for (const node of content) {
      if (node.type === "paragraph") {
        const text = this.extractTextFromParagraph(node as Paragraph);
        if (text) {
          textParts.push(text);
        }
      } else if (node.type === "list") {
        // Extract text from list items
        const list = node as List;
        for (const item of list.children) {
          const itemText = this.extractTextFromListItem(item);
          if (itemText) {
            textParts.push(`- ${itemText}`);
          }
        }
      }
    }

    // Join multiple paragraphs with newlines
    return textParts.join("\n");
  }

  /**
   * Extract text from a paragraph node
   */
  private extractTextFromParagraph(paragraph: Paragraph): string {
    const parts: string[] = [];

    for (const child of paragraph.children) {
      if (child.type === "text") {
        parts.push(this.extractTextValue(child));
      }
    }

    return parts.join("").trim();
  }

  /**
   * Extract simple array items from list nodes
   */
  private extractSimpleArrayItems(content: Content[]): string[] {
    const items: string[] = [];

    for (const node of content) {
      if (node.type === "list") {
        // TypeScript doesn't narrow Content to List automatically
        // so we need to help it understand
        const listNode = node as List;
        for (const item of listNode.children) {
          // List.children is already typed as ListItem[]
          const text = this.extractTextFromListItem(item);
          if (text) {
            items.push(text);
          }
        }
      }
    }

    return items;
  }

  /**
   * Extract array of objects from structured subsections
   */
  private extractObjectArrayItems(
    content: Content[],
    targetDepth: number,
    itemMappings: FieldMapping[],
  ): Record<string, unknown>[] {
    const items: Record<string, unknown>[] = [];
    let currentItemContent: Content[] = [];
    let inItem = false;

    for (const node of content) {
      if (node.type === "heading" && node.depth === targetDepth) {
        // Save previous item if exists
        if (inItem && currentItemContent.length > 0) {
          const subsections = this.extractSubsections(
            currentItemContent,
            targetDepth + 1,
          );
          const item = this.buildDataFromSections(
            subsections,
            itemMappings,
            targetDepth + 1,
          );
          items.push(item);
        }

        // Start new item
        currentItemContent = [];
        inItem = true;
      } else if (inItem) {
        currentItemContent.push(node);
      }
    }

    // Don't forget the last item
    if (inItem && currentItemContent.length > 0) {
      const subsections = this.extractSubsections(
        currentItemContent,
        targetDepth + 1,
      );
      const item = this.buildDataFromSections(
        subsections,
        itemMappings,
        targetDepth + 1,
      );
      items.push(item);
    }

    return items;
  }

  /**
   * Extract text from a list item
   */
  private extractTextFromListItem(listItem: ListItem): string {
    const parts: string[] = [];

    for (const child of listItem.children) {
      if (child.type === "paragraph") {
        const text = this.extractTextFromParagraph(child as Paragraph);
        if (text) {
          parts.push(text);
        }
      }
    }

    return parts.join("\n");
  }
}

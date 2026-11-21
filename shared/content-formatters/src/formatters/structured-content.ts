import type { ContentFormatter } from "../types";
import { z, type ZodType } from "@brains/utils/zod";
import { remark } from "remark";
import type { Root, Heading, RootContent } from "mdast";
import { getErrorMessage } from "@brains/utils/error";

const recordSchema = z.record(z.string(), z.unknown());

export type StructuredContentSchema<T> = ZodType<T, unknown>;

/**
 * Field mapping configuration for structured content formatting
 */
export interface FieldMapping {
  /** The data field name (supports dot notation for nested fields) */
  key: string;
  /** The markdown heading label */
  label: string;
  /** The field type */
  type: "string" | "number" | "object" | "array" | "custom" | "record";
  /** Child mappings for object types */
  children?: FieldMapping[];
  /** For arrays: the type of each item */
  itemType?: "string" | "number" | "object";
  /** For arrays of objects: mappings for each item's fields */
  itemMappings?: FieldMapping[];
  /** For records: mappings for the fields of each value, keyed by the record key */
  valueMappings?: FieldMapping[];
  /**
   * Compact layout: a single-line value, written as `- **Label:** value`
   * under the section it belongs to.
   */
  line?: boolean;
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
  /**
   * `sections` (the default) gives every field its own heading under a
   * title line. `compact` (docs/plans/one-stored-form.md, Body) writes no
   * title line, a single-line value as a labeled line, a group's one prose
   * field as its plain text and a keyed record as one heading per key; it
   * reads the sectioned layout too, and refuses a heading or a label the
   * type does not name, and a named section stated twice.
   */
  layout?: "sections" | "compact";
}

/** A labeled line as the compact layout writes it: `**Label:** value`. */
const LABELED_LINE = /^\*\*([^*\n]+?):\*\*[ \t]*(.*)$/su;

/** Text that would read back as a labeled line of its section. */
const LOOKS_LABELED = /^\s*[-*+] \*\*[^*\n]+:\*\*/mu;

/**
 * Generic formatter for structured content that uses declarative field mappings
 * to convert between structured data and human-readable markdown.
 */
export class StructuredContentFormatter<T> implements ContentFormatter<T> {
  /**
   * Markdown ↔ typed body. `parse` decodes and `format` encodes through it,
   * so a write is validated against the same schema a read is.
   */
  public readonly codec: z.ZodCodec<z.ZodString, StructuredContentSchema<T>>;
  private config: FormatterConfig;
  private processor = remark();

  constructor(schema: StructuredContentSchema<T>, config: FormatterConfig) {
    this.config = config;
    this.codec = z.codec(z.string(), schema, {
      decode: (markdown) => this.readSections(markdown),
      encode: (data) => this.render(data),
    });
  }

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
   * Generate a markdown body template with section headings.
   * Produces only the ## heading skeleton from mappings — no data, no nested subheadings.
   */
  public generateBodyTemplate(): string {
    if (this.config.mappings.length === 0) return "";
    const lines: string[] = [];
    for (const mapping of this.config.mappings) {
      lines.push(
        `## ${mapping.label}`,
        "",
        `<!-- Write your ${mapping.label.toLowerCase()} here -->`,
        "",
      );
    }
    return lines.join("\n").trimEnd() + "\n";
  }

  /**
   * Format structured data into human-readable markdown
   */
  public format(data: T): string {
    try {
      return z.encode(this.codec, data);
    } catch (error) {
      throw new Error(
        `Failed to format structured content: ${this.describeError(error)}`,
        { cause: error },
      );
    }
  }

  /**
   * Parse human-readable markdown back to structured data
   */
  public parse(content: string): T {
    try {
      return z.decode(this.codec, content);
    } catch (error) {
      throw new Error(
        `Failed to parse structured content: ${this.describeError(error)}`,
        { cause: error },
      );
    }
  }

  /** Render already-validated data as markdown (the codec's encode side). */
  private render(data: unknown): string {
    if (this.config.layout === "compact") return this.renderCompact(data);
    const lines: string[] = [`# ${this.config.title}`, ""];

    for (const mapping of this.config.mappings) {
      this.formatField(data, mapping, lines, 2);
    }

    return lines.join("\n");
  }

  /** Build unvalidated data from markdown sections (the codec's decode side). */
  private readSections(markdown: string): Record<string, unknown> {
    if (this.config.layout === "compact") return this.readCompact(markdown);
    const tree = this.processor.parse(markdown);
    const sections = this.extractSections(tree, 2);
    return this.buildDataFromSections(sections, this.config.mappings, markdown);
  }

  /**
   * Summarize an error for inclusion in a wrapped error message,
   * flattening zod issues to "path: reason" pairs.
   */
  private describeError(error: unknown): string {
    if (error instanceof z.ZodError) {
      return error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
    }
    return getErrorMessage(error);
  }

  /**
   * Escape line-leading '#' in string values so they stay paragraph text
   * when parsed back, instead of being re-read as section headings
   * (e.g. shell comments like "# install").
   */
  private escapeBlockMarkup(value: string): string {
    return value.replace(/^(\s*)#/gm, "$1\\#");
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
        // Absent optional fields stay absent — emitting an empty heading
        // would round-trip them back as "".
        if (value === undefined || value === null) break;
        lines.push(heading, this.escapeBlockMarkup(String(value)), "");
        break;

      case "object":
        if (value === undefined || value === null) break;
        lines.push(heading);
        if (mapping.children) {
          for (const child of mapping.children) {
            this.formatField(value, child, lines, depth + 1);
          }
        }
        break;

      case "array":
        if (value === undefined || value === null) break;
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
      const parsed = recordSchema.safeParse(current);
      if (!parsed.success) return undefined;
      current = parsed.data[part];
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
  ): Map<string, RootContent[]> {
    const sections = new Map<string, RootContent[]>();
    let currentSection: string | null = null;
    let currentContent: RootContent[] = [];

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
    content: RootContent[],
    targetDepth: number,
  ): Map<string, RootContent[]> {
    const subsections = new Map<string, RootContent[]>();
    let currentSubsection: string | null = null;
    let currentContent: RootContent[] = [];

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
    sections: Map<string, RootContent[]>,
    mappings: FieldMapping[],
    source: string,
    depth: number = 2,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const mapping of mappings) {
      const section = sections.get(mapping.label.toLowerCase());

      // Handle custom parser if provided
      if (mapping.type === "custom" && mapping.parser && section) {
        const textValue = this.getTextFromSection(section, source);
        const value = mapping.parser(textValue);
        this.setValueByPath(result, mapping.key, value);
      } else if (mapping.type === "object" && mapping.children && section) {
        // Extract subsections for object type
        const subsections = this.extractSubsections(section, depth + 1);
        const objectValue = this.buildDataFromSections(
          subsections,
          mapping.children,
          source,
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
            source,
          );
          this.setValueByPath(result, mapping.key, items);
        } else {
          // Extract simple list items
          const items = this.extractSimpleArrayItems(section, source);
          this.setValueByPath(
            result,
            mapping.key,
            mapping.itemType === "number" ? items.map(Number) : items,
          );
        }
      } else if (section) {
        // Extract text content for string/number types
        const textValue = this.getTextFromSection(section, source);
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

      const parsed = recordSchema.safeParse(current[part]);
      if (parsed.success) {
        current[part] = parsed.data;
        current = parsed.data;
        continue;
      }

      const next: Record<string, unknown> = {};
      current[part] = next;
      current = next;
    }

    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      current[lastPart] = value;
    }
  }

  /**
   * A section's text as authored: the markdown source between its first and
   * last node, so links, code, quotes and headings inside it survive. The
   * template's placeholder comments are not content.
   */
  private getTextFromSection(content: RootContent[], source: string): string {
    const authored = content.filter((node) => !this.isPlaceholderComment(node));
    return this.unescapeBlockMarkup(this.sourceOf(authored, source));
  }

  /** The source text spanning `nodes`, or "" when there are none. */
  private sourceOf(nodes: readonly RootContent[], source: string): string {
    const start = nodes[0]?.position?.start.offset;
    const end = nodes.at(-1)?.position?.end.offset;
    if (start === undefined || end === undefined) return "";
    return source.slice(start, end).trim();
  }

  private isPlaceholderComment(node: RootContent): boolean {
    return node.type === "html" && node.value.trim().startsWith("<!--");
  }

  /** Undo {@link escapeBlockMarkup} on read. */
  private unescapeBlockMarkup(value: string): string {
    return value.replace(/^(\s*)\\#/gm, "$1#");
  }

  /**
   * Extract simple array items from list nodes
   */
  private extractSimpleArrayItems(
    content: RootContent[],
    source: string,
  ): string[] {
    const items: string[] = [];

    for (const node of content) {
      if (node.type === "list") {
        const listNode = node;
        for (const item of listNode.children) {
          // Each item reads back as the markdown it was written as.
          const text = this.unescapeBlockMarkup(
            this.sourceOf(item.children, source),
          );
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
    content: RootContent[],
    targetDepth: number,
    itemMappings: FieldMapping[],
    source: string,
  ): Record<string, unknown>[] {
    const items: Record<string, unknown>[] = [];
    let currentItemContent: RootContent[] = [];
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
            source,
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
        source,
        targetDepth + 1,
      );
      items.push(item);
    }

    return items;
  }

  // ── Compact layout ──

  private renderCompact(data: unknown): string {
    const blocks: string[] = [];
    for (const mapping of this.config.mappings) {
      this.compactField(data, mapping, 2, blocks);
    }
    return blocks.length > 0 ? `${blocks.join("\n\n")}\n` : "";
  }

  /** One field under its own heading at `depth`. */
  private compactField(
    data: unknown,
    mapping: FieldMapping,
    depth: number,
    blocks: string[],
  ): void {
    const value = this.getValueByPath(data, mapping.key);
    if (value === undefined || value === null) return;
    const heading = `${"#".repeat(depth)} ${mapping.label}`;
    switch (mapping.type) {
      case "custom": {
        blocks.push(heading);
        const formatted = mapping.formatter?.(value);
        if (formatted) blocks.push(formatted);
        return;
      }
      case "string":
      case "number":
        blocks.push(heading, this.escapeBlockMarkup(String(value)));
        return;
      case "object":
        blocks.push(heading);
        this.compactGroup(value, mapping.children ?? [], depth + 1, blocks);
        return;
      case "record": {
        blocks.push(heading);
        const record = recordSchema.safeParse(value);
        if (!record.success) return;
        for (const [key, entry] of Object.entries(record.data)) {
          blocks.push(`${"#".repeat(depth + 1)} ${key}`);
          if (mapping.valueMappings) {
            this.compactGroup(entry, mapping.valueMappings, depth + 2, blocks);
          } else if (entry !== undefined && entry !== null) {
            blocks.push(this.escapeBlockMarkup(String(entry)));
          }
        }
        return;
      }
      case "array": {
        if (!Array.isArray(value)) return;
        blocks.push(heading);
        if (mapping.itemType === "object" && mapping.itemMappings) {
          value.forEach((item, index) => {
            blocks.push(
              `${"#".repeat(depth + 1)} ${mapping.label} ${index + 1}`,
            );
            this.compactGroup(
              item,
              mapping.itemMappings ?? [],
              depth + 2,
              blocks,
            );
          });
        } else if (value.length > 0) {
          blocks.push(
            value.map((item) => `- ${this.compactListItem(item)}`).join("\n"),
          );
        }
        return;
      }
    }
  }

  /** A list item's text; a structured item has no list form and is refused. */
  private compactListItem(item: unknown): string {
    if (typeof item === "string" || typeof item === "number")
      return String(item);
    throw new Error("A list holds only text or numbers in the compact layout");
  }

  /**
   * The fields of one object under its heading: labeled lines, then its one
   * prose field as plain text (or each prose field under its own heading),
   * then its structured fields.
   */
  private compactGroup(
    data: unknown,
    mappings: readonly FieldMapping[],
    depth: number,
    blocks: string[],
  ): void {
    const present = mappings.filter((mapping) => {
      const value = this.getValueByPath(data, mapping.key);
      return value !== undefined && value !== null;
    });
    const text = (mapping: FieldMapping): string =>
      String(this.getValueByPath(data, mapping.key));
    const lines = present.filter(
      (mapping) => mapping.line === true && !text(mapping).includes("\n"),
    );
    const prose = present.filter(
      (mapping) =>
        !lines.includes(mapping) &&
        (mapping.type === "string" || mapping.type === "number"),
    );
    const structured = present.filter(
      (mapping) => !lines.includes(mapping) && !prose.includes(mapping),
    );
    if (lines.length > 0) {
      blocks.push(
        lines
          .map((mapping) => `- **${mapping.label}:** ${text(mapping)}`)
          .join("\n"),
      );
    }
    const [only] = prose;
    if (only && prose.length === 1 && !LOOKS_LABELED.test(text(only))) {
      blocks.push(this.escapeBlockMarkup(text(only)));
    } else {
      for (const mapping of prose)
        this.compactField(data, mapping, depth, blocks);
    }
    for (const mapping of structured) {
      this.compactField(data, mapping, depth, blocks);
    }
  }

  private readCompact(markdown: string): Record<string, unknown> {
    const tree = this.processor.parse(markdown);
    // The title line the sectioned layout wrote is read past; anything else
    // above the first section would be lost on the next write.
    const lead = this.leadNodes(tree.children, 2).filter(
      (node) =>
        !(node.type === "heading" && node.depth === 1) &&
        !this.isPlaceholderComment(node),
    );
    if (lead.length > 0) {
      throw new Error("Text above the first section belongs to no field");
    }
    return this.readGroup(
      tree.children,
      this.config.mappings,
      2,
      markdown,
      true,
    );
  }

  /** The nodes before the first heading of `depth` or shallower. */
  private leadNodes(
    nodes: readonly RootContent[],
    depth: number,
  ): RootContent[] {
    const first = nodes.findIndex(
      (node) => node.type === "heading" && node.depth <= depth,
    );
    return first === -1 ? [...nodes] : nodes.slice(0, first);
  }

  /** Subsections at `depth`, keyed by heading text as written, in order. */
  private headedSections(
    nodes: readonly RootContent[],
    depth: number,
  ): { label: string; nodes: RootContent[] }[] {
    const sections: { label: string; nodes: RootContent[] }[] = [];
    for (const node of nodes) {
      if (node.type === "heading" && node.depth === depth) {
        sections.push({ label: this.getHeadingText(node).trim(), nodes: [] });
      } else if (
        node.type === "heading" &&
        node.depth < depth &&
        sections.length > 0
      ) {
        // A shallower heading closes the scope; one above every section,
        // such as the title line, is read past.
        break;
      } else {
        sections.at(-1)?.nodes.push(node);
      }
    }
    return sections;
  }

  /**
   * One object's fields from the nodes under its heading: subsections named
   * by a field's label, labeled lines, and plain prose for its one prose
   * field. `top` reads the document's sections, where nothing sits above.
   */
  private readGroup(
    nodes: readonly RootContent[],
    mappings: readonly FieldMapping[],
    depth: number,
    source: string,
    top = false,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const byLabel = new Map(
      mappings.map((mapping) => [mapping.label.toLowerCase(), mapping]),
    );
    const sections = this.headedSections(nodes, depth);
    const seen = new Set<string>();
    for (const section of sections) {
      const mapping = byLabel.get(section.label.toLowerCase());
      if (!mapping) {
        throw new Error(`Unknown section "${section.label}"`);
      }
      if (seen.has(mapping.key)) {
        throw new Error(`Section "${section.label}" is stated twice`);
      }
      seen.add(mapping.key);
      this.setValueByPath(
        result,
        mapping.key,
        this.readCompactField(section.nodes, mapping, depth, source),
      );
    }
    if (top) return result;

    const lead = this.leadNodes(nodes, depth).filter(
      (node) => !this.isPlaceholderComment(node),
    );
    const labeled = lead.filter(
      (node) =>
        node.type === "list" &&
        node.children.length > 0 &&
        node.children.every((item) =>
          LABELED_LINE.test(this.sourceOf(item.children, source)),
        ),
    );
    for (const list of labeled) {
      if (list.type !== "list") continue;
      for (const item of list.children) {
        const match = LABELED_LINE.exec(this.sourceOf(item.children, source));
        const label = match?.[1]?.trim() ?? "";
        const mapping = byLabel.get(label.toLowerCase());
        if (mapping?.line !== true) {
          throw new Error(`Unknown labeled line "${label}"`);
        }
        if (seen.has(mapping.key)) {
          throw new Error(`Field "${label}" is stated twice`);
        }
        seen.add(mapping.key);
        const value = match?.[2]?.trim() ?? "";
        this.setValueByPath(
          result,
          mapping.key,
          mapping.type === "number" ? Number(value) : value,
        );
      }
    }
    const prose = lead.filter((node) => !labeled.includes(node));
    if (prose.length > 0) {
      const candidates = mappings.filter(
        (mapping) =>
          !seen.has(mapping.key) &&
          (mapping.type === "string" || mapping.type === "number") &&
          mapping.line !== true,
      );
      const [only] = candidates;
      if (!only || candidates.length !== 1) {
        throw new Error("Text in a section belongs to no single field");
      }
      const text = this.getTextFromSection(prose, source);
      this.setValueByPath(
        result,
        only.key,
        only.type === "number" ? Number(text) : text,
      );
    }
    return result;
  }

  /** A field's value from the nodes under its heading at `depth`. */
  private readCompactField(
    nodes: readonly RootContent[],
    mapping: FieldMapping,
    depth: number,
    source: string,
  ): unknown {
    const content = [...nodes];
    switch (mapping.type) {
      case "custom":
        return mapping.parser
          ? mapping.parser(this.getTextFromSection(content, source))
          : this.getTextFromSection(content, source);
      case "string":
        return this.getTextFromSection(content, source);
      case "number":
        return Number(this.getTextFromSection(content, source));
      case "object":
        return this.readGroup(
          content,
          mapping.children ?? [],
          depth + 1,
          source,
        );
      case "record": {
        const record: Record<string, unknown> = {};
        for (const entry of this.headedSections(content, depth + 1)) {
          if (Object.hasOwn(record, entry.label)) {
            throw new Error(`"${entry.label}" is stated twice`);
          }
          record[entry.label] = mapping.valueMappings
            ? this.readGroup(
                entry.nodes,
                mapping.valueMappings,
                depth + 2,
                source,
              )
            : this.getTextFromSection(entry.nodes, source);
        }
        return record;
      }
      case "array":
        if (mapping.itemType === "object" && mapping.itemMappings) {
          return this.headedSections(content, depth + 1).map((item) =>
            this.readGroup(
              item.nodes,
              mapping.itemMappings ?? [],
              depth + 2,
              source,
            ),
          );
        }
        return mapping.itemType === "number"
          ? this.extractSimpleArrayItems(content, source).map(Number)
          : this.extractSimpleArrayItems(content, source);
    }
  }
}

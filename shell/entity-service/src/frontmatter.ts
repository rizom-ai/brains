import matter from "gray-matter";
import { z } from "@brains/utils/zod";
import { objectKeys } from "@brains/utils/object-keys";
import { isPlainRecord } from "@brains/utils/predicates";
import type { BaseEntity, ContentVisibility } from "./types";

/**
 * Configuration for frontmatter handling
 */
export interface FrontmatterConfig<T extends BaseEntity> {
  /**
   * Fields to explicitly include in frontmatter
   * If not specified, includes all non-system fields
   */
  includeFields?: (keyof T)[];

  /**
   * Fields to exclude from frontmatter
   * By default excludes: id, entityType, content, created, updated
   */
  excludeFields?: (keyof T)[];

  /**
   * Custom serializers for complex fields
   */
  customSerializers?: {
    [K in keyof T]?: (value: T[K]) => unknown;
  };
}

export interface FrontmatterValidationSchema<T> {
  parse(data: unknown): T;
}

// Default system fields that should not be in frontmatter
const DEFAULT_SYSTEM_FIELDS: Array<keyof BaseEntity> = [
  "id",
  "entityType",
  "content",
  "contentHash",
  "created",
  "updated",
  "visibility",
];

/**
 * Extract metadata fields from an entity for frontmatter
 * Returns only non-system fields by default
 */
export function extractMetadata<T extends BaseEntity>(
  entity: T,
  config?: FrontmatterConfig<T>,
): Record<string, unknown> {
  const { includeFields, excludeFields = [], customSerializers } = config ?? {};
  const excludedFieldNames = new Set<string>([
    ...DEFAULT_SYSTEM_FIELDS.map(String),
    ...excludeFields.map(String),
  ]);

  const metadata: Record<string, unknown> = {};

  // Get all fields from the entity
  const allFields = objectKeys(entity);

  // Determine which fields to include
  let fieldsToProcess: Array<keyof T & string>;
  if (includeFields) {
    // If includeFields is specified, only include those
    fieldsToProcess = includeFields
      .filter((field) => typeof field === "string")
      .filter((field) => !excludedFieldNames.has(field));
  } else {
    // Otherwise include all fields except excluded ones
    fieldsToProcess = allFields.filter(
      (field) => !excludedFieldNames.has(String(field)),
    );
  }

  // Process each field
  for (const field of fieldsToProcess) {
    const value = entity[field];

    // Skip undefined values
    if (value === undefined) {
      continue;
    }

    // Use custom serializer if available
    if (customSerializers && field in customSerializers) {
      const serializer = customSerializers[field];
      if (serializer) {
        metadata[field] = serializer(value);
      }
    } else {
      metadata[field] = value;
    }
  }

  return metadata;
}

/**
 * Generate markdown with frontmatter from content and metadata
 */
export function generateMarkdownWithFrontmatter(
  content: string,
  metadata: Record<string, unknown>,
): string {
  // null is dropped alongside undefined. Schemas model an absent value as
  // `.nullable().default(null)` to keep section content JSON-serializable, so
  // parsing a file that simply omits a key yields an explicit null. Writing
  // that back would grow `key: null` lines in hand-authored markdown on every
  // sync, so absence has to round-trip as absence.
  const cleaned = Object.fromEntries(
    Object.entries(metadata).filter(([, v]) => v !== undefined && v !== null),
  );

  // Checked after cleaning: metadata consisting only of absent values must
  // produce bare content, not an empty frontmatter block.
  if (Object.keys(cleaned).length === 0) {
    return content;
  }

  return matter.stringify(content, cleaned);
}

/**
 * Helper to convert all Date objects to ISO strings recursively
 */
function convertDatesToStrings(obj: unknown): unknown {
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map(convertDatesToStrings);
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertDatesToStrings(value);
    }
    return result;
  }
  return obj;
}

/**
 * Parse markdown with frontmatter into content and metadata
 */
export function parseMarkdownWithFrontmatter<T>(
  markdown: string,
  schema: FrontmatterValidationSchema<T>,
): {
  content: string;
  metadata: T;
} {
  const { content, data } = matter(markdown);

  // Convert all Date objects to strings before parsing with Zod
  const normalizedData = convertDatesToStrings(data);

  return {
    content: content.trim(),
    metadata: schema.parse(normalizedData),
  };
}

/**
 * Generate frontmatter string from metadata
 */
export function generateFrontmatter(metadata: Record<string, unknown>): string {
  if (Object.keys(metadata).length === 0) {
    return "";
  }

  // Use gray-matter to generate frontmatter
  const fullMarkdown = matter.stringify("", metadata);

  // Extract just the frontmatter part
  const match = fullMarkdown.match(/^---\n[\s\S]*?\n---/);
  return match ? match[0] : "";
}

/**
 * Inverse of `applyVisibilityToMarkdown` for the adapter parse path: the
 * export pipeline injects the system-owned `visibility` key into every
 * non-public file's frontmatter, so it must be removed again before a domain
 * frontmatter schema validates — a strict adapter schema must accept its own
 * exported file on re-import. Module-internal: consumed by
 * `BaseEntityAdapter.parseFrontMatter`, not part of the package API.
 */
export function stripSystemVisibility(data: unknown): unknown {
  if (!isPlainRecord(data)) {
    return data;
  }
  const { visibility: _visibility, ...rest } = data;
  return rest;
}

const visibilityFrontmatterSchema = z.object({
  visibility: z
    .enum(["public", "shared", "restricted", "private"])
    .optional()
    .transform((value): ContentVisibility | undefined => {
      if (value === undefined) return undefined;
      return value === "private" ? "restricted" : value;
    }),
});

/**
 * Read the visibility a markdown file declares, or undefined when it declares
 * none.
 *
 * Absence must stay distinguishable from an explicit "public".
 * `applyVisibilityToMarkdown` omits the key entirely for public entities, so a
 * file without it is the normal shape of exported content and carries no
 * opinion about visibility. Collapsing that to "public" makes every merge over
 * an existing entity a silent demotion.
 */
export function extractVisibilityFromMarkdown(
  markdown: string,
): ContentVisibility | undefined {
  const parsed = matter(markdown);
  return visibilityFrontmatterSchema.parse(parsed.data).visibility;
}

export function hasVisibilityFrontmatter(markdown: string): boolean {
  const frontmatterMatch = markdown.match(/^---\r?\n[\s\S]*?\r?\n---/);
  const visibilityMatch = frontmatterMatch?.[0].match(/^visibility:/m);
  return visibilityMatch !== null && visibilityMatch !== undefined;
}

export function applyVisibilityToMarkdown(
  markdown: string,
  visibility: ContentVisibility,
): string {
  if (visibility === "public" && !hasVisibilityFrontmatter(markdown)) {
    return markdown;
  }

  const parsed = matter(markdown);
  const frontmatter = Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) => key !== "visibility"),
  );

  if (visibility !== "public") {
    frontmatter["visibility"] = visibility;
  }

  return generateMarkdownWithFrontmatter(parsed.content.trim(), frontmatter);
}

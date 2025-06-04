import matter from "gray-matter";
import type { BaseEntity } from "@brains/types";

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

  /**
   * Custom deserializers for complex fields
   */
  customDeserializers?: {
    [K in keyof T]?: (value: unknown) => T[K];
  };
}

// Default system fields that should not be in frontmatter
const DEFAULT_SYSTEM_FIELDS: Array<keyof BaseEntity> = [
  "id",
  "entityType",
  "content",
  "created",
  "updated",
];

/**
 * Extract metadata fields from an entity for frontmatter
 * Returns only non-system fields by default
 */
export function extractMetadata<T extends BaseEntity>(
  entity: T,
  config?: FrontmatterConfig<T>,
): Record<string, unknown> {
  const {
    includeFields,
    excludeFields = DEFAULT_SYSTEM_FIELDS,
    customSerializers,
  } = config ?? {};

  const metadata: Record<string, unknown> = {};

  // Get all fields from the entity
  const allFields = Object.keys(entity) as Array<keyof T>;

  // Determine which fields to include
  let fieldsToProcess: Array<keyof T>;
  if (includeFields) {
    // If includeFields is specified, only include those
    fieldsToProcess = includeFields;
  } else {
    // Otherwise include all fields except excluded ones
    fieldsToProcess = allFields.filter(
      (field) => !excludeFields.includes(field as keyof BaseEntity),
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
        metadata[field as string] = serializer(value);
      }
    } else {
      metadata[field as string] = value;
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
  // Only add frontmatter if there's metadata
  if (Object.keys(metadata).length === 0) {
    return content;
  }

  return matter.stringify(content, metadata);
}

/**
 * Parse markdown with frontmatter into content and metadata
 */
export function parseMarkdownWithFrontmatter(markdown: string): {
  content: string;
  metadata: Record<string, unknown>;
} {
  const { content, data } = matter(markdown);

  return {
    content: content.trim(),
    metadata: data as Record<string, unknown>,
  };
}

/**
 * Apply custom deserializers to metadata
 */
export function deserializeMetadata<T extends BaseEntity>(
  metadata: Record<string, unknown>,
  config?: FrontmatterConfig<T>,
): Record<string, unknown> {
  if (!config?.customDeserializers) {
    return metadata;
  }

  const result: Record<string, unknown> = { ...metadata };

  for (const [field, deserializer] of Object.entries(
    config.customDeserializers,
  )) {
    if (field in metadata) {
      result[field] = deserializer(metadata[field]);
    }
  }

  return result;
}

/**
 * Create a frontmatter-aware adapter for an entity type
 */
export function createFrontmatterAdapter<T extends BaseEntity>(
  config?: FrontmatterConfig<T>,
): {
  toMarkdown: (entity: T) => string;
  fromMarkdown: (markdown: string) => Partial<T>;
  extractMetadata: (entity: T) => Record<string, unknown>;
  parseFrontMatter: (markdown: string) => Record<string, unknown>;
  generateFrontMatter: (entity: T) => string;
} {
  return {
    /**
     * Convert entity to markdown with frontmatter
     */
    toMarkdown: (entity: T): string => {
      const metadata = extractMetadata(entity, config);
      return generateMarkdownWithFrontmatter(entity.content, metadata);
    },

    /**
     * Parse markdown to extract entity fields
     */
    fromMarkdown: (markdown: string): Partial<T> => {
      const { content, metadata } = parseMarkdownWithFrontmatter(markdown);
      const deserializedMetadata = deserializeMetadata<T>(metadata, config);

      return {
        ...deserializedMetadata,
        content,
      } as Partial<T>;
    },

    /**
     * Extract metadata for database storage
     */
    extractMetadata: (entity: T): Record<string, unknown> => {
      return extractMetadata(entity, config);
    },

    /**
     * Parse frontmatter without processing content
     */
    parseFrontMatter: (markdown: string): Record<string, unknown> => {
      const { data } = matter(markdown);
      return data as Record<string, unknown>;
    },

    /**
     * Generate frontmatter string only
     */
    generateFrontMatter: (entity: T): string => {
      const metadata = extractMetadata(entity, config);
      if (Object.keys(metadata).length === 0) {
        return "";
      }

      // Generate markdown with empty content and extract just frontmatter
      const fullMarkdown = matter.stringify("", metadata);
      const lines = fullMarkdown.split("\n");

      // Find the closing --- and return everything up to and including it
      const endIndex = lines.findIndex((line, i) => i > 0 && line === "---");
      if (endIndex > 0) {
        return lines.slice(0, endIndex + 1).join("\n");
      }

      return "";
    },
  };
}

/**
 * Check if a value should be included in frontmatter
 * Filters out undefined, null, empty arrays, and empty objects
 */
export function shouldIncludeInFrontmatter(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (Array.isArray(value) && value.length === 0) {
    return false;
  }

  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  ) {
    return false;
  }

  return true;
}

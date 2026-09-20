import matter from "gray-matter";
import { z } from "@brains/utils/zod";
import type { FrontmatterSchema } from "./types";
import { parseMarkdownWithFrontmatter } from "./frontmatter";

const recordSchema = z.record(z.string(), z.unknown());
const policyKeys = new Set([
  "id",
  "entityType",
  "content",
  "contentHash",
  "created",
  "updated",
  "visibility",
]);

/** Projection is derived from source, never from a caller's cached metadata. */
export function projectFrontmatterExtensions(
  content: string,
  metadata: Record<string, unknown>,
  extensions: readonly FrontmatterSchema[],
): Record<string, unknown> {
  if (extensions.length === 0) return metadata;
  const { metadata: source } = parseMarkdownWithFrontmatter(
    content,
    recordSchema,
  );
  const projected = { ...metadata };
  for (const extension of extensions) {
    const keys = Object.keys(extension.shape);
    const input = Object.fromEntries(
      keys
        .filter((key) => Object.hasOwn(source, key))
        .map((key) => [key, source[key]]),
    );
    // Parse the whole extension, including cross-field refinements.
    const parsed = extension.parse(input);
    for (const key of keys) {
      delete projected[key];
      if (
        Object.hasOwn(source, key) &&
        parsed[key] !== undefined &&
        !policyKeys.has(key)
      ) {
        projected[key] = parsed[key];
      }
    }
  }
  return projected;
}

/** Preserve unclaimed source fields even after their extension is disabled.
 * Export deliberately does not validate/repair malformed persisted values.
 */
export function preserveSourceFrontmatter(
  sourceContent: string,
  serializedContent: string,
  ownerSchema: FrontmatterSchema | undefined,
  extensions: readonly FrontmatterSchema[],
  groupingFields: readonly string[] = [],
): string {
  if (!ownerSchema) return serializedContent;
  const source = matter(sourceContent);
  const serialized = matter(serializedContent);
  const sourceFields = recordSchema.parse(source.data);
  const serializedFields = recordSchema.parse(serialized.data);
  const extensionKeys = new Set([
    ...extensions.flatMap((schema) => Object.keys(schema.shape)),
    ...groupingFields,
  ]);
  const additions = Object.entries(sourceFields).filter(
    ([key, value]) =>
      !policyKeys.has(key) &&
      (!Object.hasOwn(ownerSchema.shape, key) || extensionKeys.has(key)) &&
      (!Object.hasOwn(serializedFields, key) ||
        JSON.stringify(serializedFields[key]) !== JSON.stringify(value)),
  );
  const removals = [...extensionKeys].filter(
    (key) =>
      !Object.hasOwn(sourceFields, key) && Object.hasOwn(serializedFields, key),
  );
  if (additions.length === 0 && removals.length === 0) return serializedContent;
  const result = { ...serializedFields };
  for (const key of removals) delete result[key];
  for (const [key, value] of additions) result[key] = value;
  // Unlike the domain formatter, preserve explicit null in unclaimed fields.
  return Object.keys(result).length > 0
    ? matter.stringify(serialized.content, result)
    : serialized.content;
}

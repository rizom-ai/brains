import {
  generateMarkdown,
  readMarkdownFrontmatter,
} from "@brains/utils/markdown-frontmatter";
import { isRecord } from "@brains/utils/is-record";
import { z } from "@brains/utils/zod";
import { ENTITY_SYSTEM_FIELDS } from "./frontmatter";
import type { FrontmatterSchema } from "./types";

const recordSchema = z.record(z.string(), z.unknown());
const policyKeys: ReadonlySet<string> = new Set(ENTITY_SYSTEM_FIELDS);

/** How a registered field whose stored value fails its own schema is treated. */
export type InvalidFieldPolicy = "reject" | "omit";

/** Projection is derived from source, never from a caller's cached metadata. */
export function projectFrontmatterExtensions(
  source: Record<string, unknown>,
  metadata: Record<string, unknown>,
  extensions: readonly FrontmatterSchema[],
  invalid: InvalidFieldPolicy = "reject",
): Record<string, unknown> {
  if (extensions.length === 0) return metadata;
  const projected = { ...metadata };
  for (const extension of extensions) {
    const keys = Object.keys(extension.shape);
    const input = Object.fromEntries(
      keys
        .filter((key) => Object.hasOwn(source, key))
        .map((key) => [key, source[key]]),
    );
    // Parse the whole extension, including cross-field refinements. Only this
    // extension's own keys are read, so another field's error never lands here.
    const result = extension.safeParse(input);
    if (!result.success && invalid === "reject") throw result.error;
    for (const key of keys) {
      delete projected[key];
      if (
        result.success &&
        Object.hasOwn(source, key) &&
        result.data[key] !== undefined &&
        !policyKeys.has(key)
      ) {
        projected[key] = result.data[key];
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
  retiredFields: readonly string[] = [],
): string {
  if (!ownerSchema) return serializedContent;
  // A nested path retires a key inside its object, never the object itself.
  const retired = new Set(retiredFields.filter((path) => !path.includes(".")));
  const source = readMarkdownFrontmatter(sourceContent);
  const serialized = readMarkdownFrontmatter(serializedContent);
  const sourceFields = recordSchema.parse(source.data);
  const serializedFields = recordSchema.parse(serialized.data);
  const extensionKeys = new Set([
    ...extensions.flatMap((schema) => Object.keys(schema.shape)),
    ...groupingFields,
  ]);
  const additions = Object.entries(sourceFields).filter(
    ([key, value]) =>
      !policyKeys.has(key) &&
      !retired.has(key) &&
      (!Object.hasOwn(ownerSchema.shape, key) || extensionKeys.has(key)) &&
      (!Object.hasOwn(serializedFields, key) ||
        JSON.stringify(serializedFields[key]) !== JSON.stringify(value)),
  );
  const removals = [
    ...[...extensionKeys].filter(
      (key) =>
        !Object.hasOwn(sourceFields, key) &&
        Object.hasOwn(serializedFields, key),
    ),
    ...[...retired].filter((key) => Object.hasOwn(serializedFields, key)),
  ];
  const merged = { ...serializedFields };
  for (const key of removals) delete merged[key];
  for (const [key, value] of additions) merged[key] = value;
  // An object the type owns keeps a key inside it the type does not name,
  // as the top level keeps one: an author's `cta.subtitle` is not deleted
  // because the schema strips it on read.
  const nested = Object.entries(sourceFields).flatMap(([key, value]) => {
    const written = merged[key];
    const shape = Object.hasOwn(ownerSchema.shape, key)
      ? objectShapeOf(ownerSchema.shape[key])
      : undefined;
    if (!shape || !isRecord(value) || !isRecord(written)) return [];
    const kept = Object.entries(value).filter(
      ([inner]) =>
        !Object.hasOwn(shape, inner) && !Object.hasOwn(written, inner),
    );
    return kept.length > 0
      ? [[key, { ...written, ...Object.fromEntries(kept) }] as const]
      : [];
  });
  for (const [key, value] of nested) merged[key] = value;
  const result = dropFields(merged, retiredFields) ?? merged;
  if (
    additions.length === 0 &&
    removals.length === 0 &&
    nested.length === 0 &&
    result === merged
  )
    return serializedContent;
  // Unlike the domain formatter, preserve explicit null in unclaimed fields.
  return Object.keys(result).length > 0
    ? generateMarkdown(result, serialized.content)
    : serialized.content;
}

/**
 * The shape of the object a field holds, through the optional, default and
 * nullable wrappers around it; none for a field that holds no object.
 */
export function objectShapeOf(
  schema: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (schema instanceof z.ZodObject) return schema.shape;
  if (!(schema instanceof z.ZodType)) return undefined;
  const inner: unknown = Reflect.get(schema._zod.def, "innerType");
  return inner === undefined ? undefined : objectShapeOf(inner);
}

/** Keys a type never writes: its retired and its translated fields. */
export function unwrittenFields(config: {
  retiredFields?: readonly string[] | undefined;
  translatedFields?: readonly string[] | undefined;
}): readonly string[] {
  return [...(config.retiredFields ?? []), ...(config.translatedFields ?? [])];
}

/**
 * The record without the given fields: a top-level key, or a key one level
 * down as `parent.key`. Undefined when the record holds none of them.
 */
export function dropFields(
  record: Record<string, unknown>,
  paths: readonly string[],
): Record<string, unknown> | undefined {
  const result = paths.reduce<Record<string, unknown>>((current, path) => {
    const [parent, key] = path.split(".", 2);
    if (parent === undefined || !Object.hasOwn(current, parent)) return current;
    if (key === undefined) {
      const { [parent]: _dropped, ...rest } = current;
      return rest;
    }
    const nested = current[parent];
    if (!isRecord(nested) || !Object.hasOwn(nested, key)) return current;
    const { [key]: _dropped, ...kept } = nested;
    return { ...current, [parent]: kept };
  }, record);
  return result === record ? undefined : result;
}

/** Markdown with the given frontmatter keys removed; unchanged when it has none of them. */
export function withoutFrontmatterFields(
  content: string,
  fields: readonly string[],
): string {
  if (fields.length === 0) return content;
  const parsed = readMarkdownFrontmatter(content);
  const data = recordSchema.safeParse(parsed.data);
  if (!data.success) return content;
  const kept = dropFields(data.data, fields);
  if (!kept) return content;
  return Object.keys(kept).length > 0
    ? generateMarkdown(kept, parsed.content)
    : parsed.content;
}

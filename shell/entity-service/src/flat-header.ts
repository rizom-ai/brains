import { z } from "@brains/utils/zod";

/** A field with its optional, nullable, defaulted and piped wrappers off. */
function core(field: unknown): unknown {
  if (
    field instanceof z.ZodOptional ||
    field instanceof z.ZodNullable ||
    field instanceof z.ZodDefault ||
    field instanceof z.ZodPrefault ||
    field instanceof z.ZodReadonly ||
    field instanceof z.ZodCatch
  ) {
    return core(field.unwrap());
  }
  if (field instanceof z.ZodPipe) return core(field.in);
  return field;
}

/** The type tags of a scalar: text in any format, a number, a flag, a date. */
const SCALAR_TYPES = new Set([
  "string",
  "number",
  "int",
  "bigint",
  "boolean",
  "enum",
  "literal",
  "date",
  "null",
  "template_literal",
]);

/** A scalar: text, a number, a flag, a date, one of a set of values. */
function isScalar(field: unknown): boolean {
  const inner = core(field);
  if (inner instanceof z.ZodUnion)
    return inner.options.every((option) => isScalar(option));
  return inner instanceof z.ZodType && SCALAR_TYPES.has(inner.def.type);
}

/** Whether a field is a scalar or a list of scalars. */
function isFlat(field: unknown): boolean {
  const inner = core(field);
  if (inner instanceof z.ZodArray) return isScalar(inner.element);
  if (inner instanceof z.ZodUnion)
    return inner.options.every((option) => isFlat(option));
  return isScalar(inner);
}

/**
 * The keys of a header that nest: an object, a record, or a list of
 * anything but scalars (docs/external-plugin-authoring.md, The stored format). A markdown
 * file's header is flat, so Obsidian shows every key as a property.
 */
export function nestedHeaderKeys(header: z.ZodObject<z.ZodRawShape>): string[] {
  return Object.entries(header.shape).flatMap(([key, field]) =>
    isFlat(field) ? [] : [key],
  );
}

/** A written value a flat header holds: a scalar, or a list of scalars. */
function isFlatValue(value: unknown): boolean {
  if (Array.isArray(value))
    return value.every((item) => item === null || typeof item !== "object");
  return value === null || typeof value !== "object" || value instanceof Date;
}

/**
 * The keys of a written header whose value nests: an object, or a list
 * holding one. A codec that writes such a header is refused at the write.
 */
export function nestedHeaderValueKeys(
  header: Record<string, unknown>,
): string[] {
  return Object.entries(header).flatMap(([key, value]) =>
    isFlatValue(value) ? [] : [key],
  );
}

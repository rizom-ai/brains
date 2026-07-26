/**
 * Introspection helpers for Zod 4 schemas.
 *
 * Centralizes all access to Zod schema internals (`schema.def`) behind typed
 * `instanceof` narrowing on Zod's public classes, so callers never poke at
 * def structures (and never need type casts) themselves.
 */
import { z } from "./zod";

/**
 * Result of unwrapping optional/nullable/default/pipe wrappers from a field
 * schema. `defaultValue` is only present when a `.default()` wrapper supplied
 * one.
 */
export interface UnwrappedField {
  inner: unknown;
  required: boolean;
  defaultValue?: unknown;
}

/**
 * The kind string of a schema's public def ("string", "enum", "optional", ...),
 * or undefined for non-schemas.
 */
export function getKind(schema: unknown): string | undefined {
  return schema instanceof z.ZodType ? schema.def.type : undefined;
}

function readDefaultValue(value: unknown): unknown {
  return typeof value === "function" ? value() : value;
}

/**
 * Unwrap Zod wrappers (optional, nullable, default, pipe/preprocess) down to
 * the base schema. A field is `required` unless an optional/nullable/default
 * wrapper was removed; pipes unwrap to their output schema without affecting
 * requiredness.
 */
export function unwrapField(schema: unknown): UnwrappedField {
  let inner: unknown = schema;
  let required = true;
  let defaultValue: unknown;
  let hasDefault = false;

  for (;;) {
    if (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) {
      required = false;
      inner = inner.unwrap();
      continue;
    }
    if (inner instanceof z.ZodDefault) {
      required = false;
      hasDefault = true;
      defaultValue = readDefaultValue(inner.def.defaultValue);
      inner = inner.def.innerType;
      continue;
    }
    if (inner instanceof z.ZodPipe) {
      // A preprocess/pipe carries the real field shape in its output schema;
      // unwrap to it so e.g. enums keep their options.
      inner = inner.def.out;
      continue;
    }
    break;
  }

  const result: UnwrappedField = { inner, required };
  if (hasDefault && defaultValue !== undefined) {
    result.defaultValue = defaultValue;
  }
  return result;
}

/**
 * The values of an enum schema, when they are all strings.
 */
export function readEnumValues(schema: unknown): string[] | undefined {
  if (!(schema instanceof z.ZodEnum)) return undefined;
  const values = Object.values(schema.def.entries);
  if (values.every((value): value is string => typeof value === "string")) {
    return values;
  }
  return undefined;
}

/**
 * The (first) value of a literal schema, or undefined for non-literals.
 */
export function readLiteralValue(schema: unknown): unknown {
  return schema instanceof z.ZodLiteral ? schema.def.values[0] : undefined;
}

/**
 * The shape (field name to field schema) of an object schema.
 */
export function getObjectShape(
  schema: unknown,
): Record<string, unknown> | undefined {
  return schema instanceof z.ZodObject ? schema.shape : undefined;
}

/**
 * The element schema of an array schema, or undefined for non-arrays.
 */
export function getArrayElement(schema: unknown): unknown {
  return schema instanceof z.ZodArray ? schema.def.element : undefined;
}

/**
 * Whether a string schema carries a string-format check (e.g. "datetime",
 * "email"). Covers both `z.string().datetime()`-style checks and top-level
 * format schemas like `z.iso.datetime()` (which register themselves as their
 * own check).
 */
export function hasStringFormat(schema: unknown, format: string): boolean {
  if (schema instanceof z.ZodStringFormat) {
    return schema.def.format === format;
  }
  if (!(schema instanceof z.ZodString)) return false;
  const checks = schema.def.checks ?? [];
  return checks.some(
    (check) =>
      check instanceof z.ZodStringFormat && check.def.format === format,
  );
}

/**
 * Metadata registered on a schema via `.meta()`, or undefined when none.
 */
export function readMetadata(
  schema: unknown,
): Record<string, unknown> | undefined {
  return schema instanceof z.ZodType ? schema.meta() : undefined;
}

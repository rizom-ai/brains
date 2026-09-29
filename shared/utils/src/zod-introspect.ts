/**
 * Introspection helpers for Zod 4 schemas.
 *
 * Centralizes all access to Zod schema internals (`schema.def`) behind typed
 * `instanceof` narrowing on Zod's public classes, so callers never poke at
 * def structures (and never need type casts) themselves.
 */
import { z } from "./zod";

/**
 * Conservative equality for reusable string-list fields. JSON Schema omits
 * refinements and transformations. Runtime checks must therefore be shared
 * objects, and defaults/transforms/unknown wrappers require schema identity.
 * Check-free lists, strings, enums and their optional/nullable wrappers can
 * still be declared independently. Never execute defaults to compare them.
 */
export function haveSameStringListContract(
  left: unknown,
  right: unknown,
): boolean {
  if (!(left instanceof z.ZodType) || !(right instanceof z.ZodType))
    return false;
  if (left === right) return true;
  const leftChecks = left.def.checks ?? [];
  const rightChecks = right.def.checks ?? [];
  if (
    leftChecks.length !== rightChecks.length ||
    leftChecks.some((check, index) => check !== rightChecks[index])
  )
    return false;
  if (left instanceof z.ZodOptional && right instanceof z.ZodOptional)
    return haveSameStringListContract(left.unwrap(), right.unwrap());
  if (left instanceof z.ZodNullable && right instanceof z.ZodNullable)
    return haveSameStringListContract(left.unwrap(), right.unwrap());
  if (left instanceof z.ZodArray && right instanceof z.ZodArray)
    return haveSameStringListContract(left.element, right.element);
  // String formats can carry validation outside def.checks.
  if (left instanceof z.ZodStringFormat || right instanceof z.ZodStringFormat)
    return false;
  if (left instanceof z.ZodString && right instanceof z.ZodString)
    return left.def.coerce === right.def.coerce;
  if (left instanceof z.ZodEnum && right instanceof z.ZodEnum)
    return (
      JSON.stringify(left.def.entries) === JSON.stringify(right.def.entries)
    );
  if (left instanceof z.ZodLiteral && right instanceof z.ZodLiteral)
    return (
      left.def.values.length === right.def.values.length &&
      left.def.values.every((value, index) =>
        Object.is(value, right.def.values[index]),
      )
    );
  return false;
}

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
  const peeled = peelWrappers(schema, true, undefined, false);
  const result: UnwrappedField = {
    inner: peeled.inner,
    required: peeled.required,
  };
  if (peeled.hasDefault && peeled.defaultValue !== undefined) {
    result.defaultValue = peeled.defaultValue;
  }
  return result;
}

interface PeeledField {
  inner: unknown;
  required: boolean;
  defaultValue: unknown;
  hasDefault: boolean;
}

/** One wrapper per step; the innermost schema is the one that stops recursing. */
function peelWrappers(
  inner: unknown,
  required: boolean,
  defaultValue: unknown,
  hasDefault: boolean,
): PeeledField {
  if (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) {
    return peelWrappers(inner.unwrap(), false, defaultValue, hasDefault);
  }
  if (inner instanceof z.ZodDefault) {
    return peelWrappers(
      inner.def.innerType,
      false,
      readDefaultValue(inner.def.defaultValue),
      true,
    );
  }
  if (inner instanceof z.ZodPipe) {
    // A preprocess/pipe carries the real field shape in its output schema;
    // unwrap to it so e.g. enums keep their options.
    return peelWrappers(inner.def.out, required, defaultValue, hasDefault);
  }
  return { inner, required, defaultValue, hasDefault };
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

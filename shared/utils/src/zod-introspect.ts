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
 * Find explicit value-rewriting schemas/checks without parsing sample values or
 * evaluating defaults. Pipelines (including preprocessors/codecs) are rejected
 * as a whole: even `string().pipe(coerce.number())` cannot read its own output.
 * Overwrite checks include string trim/case conversion as well as arbitrary
 * callbacks; no attempt is made to infer a callback's idempotence.
 */
export function findSchemaTransformation(
  schema: unknown,
  path = "schema",
): { path: string; kind: string } | undefined {
  const seen = new Set<unknown>();
  const visit = (
    value: unknown,
    location: string,
  ): { path: string; kind: string } | undefined => {
    if (!(value instanceof z.ZodType) || seen.has(value)) return undefined;
    seen.add(value);
    if (
      value instanceof z.ZodPipe ||
      value instanceof z.ZodTransform ||
      value instanceof z.ZodSuccess
    ) {
      return { path: location, kind: value.def.type };
    }
    if (
      value.def.checks?.some(
        (check) => check instanceof z.core.$ZodCheckOverwrite,
      )
    ) {
      return { path: location, kind: "overwrite" };
    }
    const children: Array<[string, unknown]> = [];
    if (value instanceof z.ZodObject) {
      children.push(
        ...Object.entries(value.shape).map(
          ([key, field]): [string, unknown] => [`${location}.${key}`, field],
        ),
      );
      children.push([`${location}.*`, value.def.catchall]);
    } else if (value instanceof z.ZodArray) {
      children.push([`${location}[]`, value.element]);
    } else if (value instanceof z.ZodUnion) {
      children.push(
        ...value.options.map((option, index): [string, unknown] => [
          `${location}.option[${index}]`,
          option,
        ]),
      );
    } else if (value instanceof z.ZodIntersection) {
      children.push(
        [`${location}.left`, value.def.left],
        [`${location}.right`, value.def.right],
      );
    } else if (value instanceof z.ZodTuple) {
      children.push(
        ...value.def.items.map((item, index): [string, unknown] => [
          `${location}[${index}]`,
          item,
        ]),
      );
      children.push([`${location}[...]`, value.def.rest]);
    } else if (value instanceof z.ZodRecord || value instanceof z.ZodMap) {
      children.push(
        [`${location}.key`, value.def.keyType],
        [`${location}.*`, value.def.valueType],
      );
    } else if (value instanceof z.ZodSet) {
      children.push([`${location}[]`, value.def.valueType]);
    } else if (value instanceof z.ZodLazy) {
      children.push([location, value.unwrap()]);
    } else if (
      value instanceof z.ZodOptional ||
      value instanceof z.ZodNullable ||
      value instanceof z.ZodNonOptional ||
      value instanceof z.ZodDefault ||
      value instanceof z.ZodPrefault ||
      value instanceof z.ZodCatch ||
      value instanceof z.ZodReadonly ||
      value instanceof z.ZodPromise
    ) {
      children.push([location, value.def.innerType]);
    } else if (value instanceof z.ZodTemplateLiteral) {
      children.push(
        ...value.def.parts.map((part, index): [string, unknown] => [
          `${location}.part[${index}]`,
          part,
        ]),
      );
    }
    for (const [childPath, child] of children) {
      const found = visit(child, childPath);
      if (found) return found;
    }
    return undefined;
  };
  return visit(schema, path);
}

/** Metadata registered on a schema via `.meta()`, or undefined when none. */
export function readMetadata(
  schema: unknown,
): Record<string, unknown> | undefined {
  return schema instanceof z.ZodType ? schema.meta() : undefined;
}

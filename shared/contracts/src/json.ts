import { z } from "@brains/utils/zod";

export type JsonPrimitive = null | boolean | number | string;

export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

/** A JSON document with an object at its root. */
export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * Parser for a JSON value. Recursive through z.lazy, so the type is declared
 * rather than inferred. Rejects non-finite numbers and integers outside the
 * safe range: a JSON round-trip would silently reround them, breaking
 * deterministic comparison of anything snapshotted through it.
 */
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z
      .number()
      .finite()
      .refine(
        (value) => !Number.isInteger(value) || Number.isSafeInteger(value),
        { message: "integer exceeds the JSON-safe range" },
      ),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const jsonObjectSchema: z.ZodRecord<
  z.ZodString,
  typeof jsonValueSchema
> = z.record(z.string(), jsonValueSchema);

type IsJsonValueMember<
  T,
  Depth extends readonly unknown[],
> = T extends JsonPrimitive
  ? true
  : T extends readonly (infer Item)[]
    ? IsJsonValue<Item, [...Depth, unknown]>
    : T extends (...args: never[]) => unknown
      ? false
      : T extends object
        ? [keyof T] extends [never]
          ? false
          : string extends keyof T
            ? T extends JsonObject
              ? true
              : false
            : false extends {
                  [K in keyof T]-?: IsJsonValue<T[K], [...Depth, unknown]>;
                }[keyof T]
              ? false
              : true
        : false;

/**
 * Whether a type is composed entirely of JSON values.
 * Types deeper than 32 levels fail closed to cap compiler recursion.
 */
export type IsJsonValue<
  T,
  Depth extends readonly unknown[] = [],
> = Depth["length"] extends 32
  ? false
  : undefined extends T
    ? false
    : false extends IsJsonValueMember<T, Depth>
      ? false
      : true;

/** Resolves to `unknown` for JSON-object output without `undefined`, else `never`. */
export type JsonObjectOutputGuard<T> = [T] extends [readonly unknown[]]
  ? never
  : [T] extends [object]
    ? IsJsonValue<T> extends true
      ? unknown
      : never
    : never;

/**
 * Runtime counterpart to {@link IsJsonValue}. Lets a caller that owns a
 * differently-typed schema prove its output really is a JSON document rather
 * than assert it — `schema.pipe(jsonObjectSchema)` parses with the caller's
 * schema first, then validates the result is serializable.
 */
export const jsonValueSchema: z.ZodType<JsonValue, unknown> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z
      .number()
      .finite()
      .refine(
        (value) => !Number.isInteger(value) || Number.isSafeInteger(value),
        { message: "integer exceeds the JSON-safe range" },
      ),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

/** A JSON document with an object at its root. */
export const jsonObjectSchema: z.ZodType<JsonObject, unknown> = z.record(
  z.string(),
  jsonValueSchema,
);

import type { z } from "./zod";

type AnySchema = z.ZodType<unknown, unknown>;

/**
 * Parse `value` through `schema`, preserving the schema's output type even when
 * `schema` arrives as a generic parameter.
 *
 * Why this exists: at a call site whose schema is a deferred generic — say
 * `definition.metadata` typed as `TDefinition["metadata"]` — TypeScript
 * resolves `.parse` through the *constraint* and hands back
 * `Record<string, unknown>`, not `z.output<TDefinition["metadata"]>`. Naming
 * the schema type as a parameter here is what lets the two meet, so callers
 * write `parseWithSchema<TDefinition["metadata"]>(schema, value)` instead of
 * asserting.
 *
 * Inside this body the connection needs no assertion: with `S` bound,
 * `schema.parse` already returns `z.output<S>`.
 */
export function parseWithSchema<S extends AnySchema>(
  schema: S,
  value: unknown,
): z.output<S> {
  return schema.parse(value);
}

export type SafeParseResult<T> =
  { success: true; data: T } | { success: false; error: z.ZodError };

/** `safeParse` counterpart to {@link parseWithSchema}, for the same reason. */
export function safeParseWithSchema<S extends AnySchema>(
  schema: S,
  value: unknown,
): SafeParseResult<z.output<S>> {
  const result = schema.safeParse(value);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}

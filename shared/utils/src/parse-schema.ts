import type { z } from "./zod";

type AnySchema = z.ZodType<unknown, unknown>;

/**
 * Parse `value` through `schema`, preserving the schema's output type even when
 * `schema` arrives as a generic parameter.
 *
 * Why this exists: when a function is generic over `S extends ZodType<unknown,
 * unknown>`, TypeScript resolves `schema.parse` through that *constraint* and
 * returns `unknown`, while the declared return type stays the deferred
 * `z.output<S>`. The two never meet, so every such call site otherwise needs
 * its own assertion. The single assertion lives here instead — the runtime
 * value really is `z.output<S>`, because `schema.parse` produced it.
 */
export function parseWithSchema<S extends AnySchema>(
  schema: S,
  value: unknown,
): z.output<S> {
  return schema.parse(value) as z.output<S>;
}

export type SafeParseResult<T> =
  { success: true; data: T } | { success: false; error: z.ZodError };

/** `safeParse` counterpart to {@link parseWithSchema}, with the same rationale. */
export function safeParseWithSchema<S extends AnySchema>(
  schema: S,
  value: unknown,
): SafeParseResult<z.output<S>> {
  const result = schema.safeParse(value);
  return result.success
    ? { success: true, data: result.data as z.output<S> }
    : { success: false, error: result.error };
}

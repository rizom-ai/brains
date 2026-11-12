import type { z } from "@brains/utils/zod";

export type ReadonlyInput<T> = T extends Date | ((...args: never[]) => unknown)
  ? T
  : { readonly [K in keyof T]: ReadonlyInput<T[K]> };

/**
 * What a callback writes for a schema — entity metadata, a tool's output, an
 * answer, a route's response: the schema's input, also accepted read-only.
 *
 * Spelled through the schema's own input slot so that, with the schema taken
 * as a `const` parameter, a literal written inline is in a const context. It
 * then keeps its literal type even before the schema is inferred, which
 * TypeScript has not yet done when it checks a callback without parameters.
 * A const context makes arrays read-only, hence the read-only form.
 */
export type SchemaValue<TSchema extends z.ZodType<unknown, unknown>> =
  TSchema["_zod"]["input"] | ReadonlyInput<z.input<TSchema>>;

/**
 * Stable internal Zod subpath.
 *
 * This alias intentionally resolves to the monorepo's Zod 4 boundary. Keep it
 * for older @brains/utils zod-subpath imports, but prefer new internal imports
 * from @brains/utils/zod-v4 when the Zod major matters at the call site.
 *
 * IMPORTANT: Do not use wildcard exports here as they cause TypeScript to load
 * all of Zod's complex types, creating millions of type instantiations.
 */

export { default, z, ZodError } from "./zod-v4";
export type {
  ZodCatch,
  ZodDefault,
  ZodErrorMap,
  ZodInfer,
  ZodInput,
  ZodLiteral,
  ZodNullable,
  ZodOptional,
  ZodOutput,
  ZodRawShape,
  ZodSchema,
  ZodType,
  ZodTypeAny,
} from "./zod-v4";

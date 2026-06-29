/**
 * Compatibility Zod subpath.
 *
 * Keep this file so older @brains/utils zod-subpath imports continue to
 * resolve, but route the export through the monorepo's Zod 4 boundary.
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

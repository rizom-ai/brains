/**
 * Centralized Zod 4 exports for the monorepo.
 *
 * IMPORTANT: Do not use wildcard exports here as they cause TypeScript to load
 * all of Zod's complex types, creating millions of type instantiations.
 */

export { z as default } from "zod/v4";
export { z, ZodError } from "zod/v4";
export type {
  ZodCatch,
  ZodDefault,
  ZodErrorMap,
  ZodLiteral,
  ZodNullable,
  ZodOptional,
  ZodRawShape,
  ZodSchema,
  ZodType,
  ZodTypeAny,
} from "zod/v4";
export type {
  infer as ZodInfer,
  input as ZodInput,
  output as ZodOutput,
} from "zod/v4";

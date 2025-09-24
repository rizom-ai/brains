/**
 * Centralized Zod exports for the entire monorepo.
 * This provides a single point of control for Zod versioning and migrations.
 *
 * IMPORTANT: Do not use wildcard exports here as they cause TypeScript to load
 * all of Zod's complex types, creating millions of type instantiations.
 */

// Default export
export { z as default } from "zod";

// Explicit named exports for commonly used items
export { z, ZodError } from "zod";

// Type-only re-exports that need explicit type annotation
export type { ZodType, ZodSchema } from "zod";

// Type-only exports for better tree-shaking
export type {
  infer as ZodInfer,
  input as ZodInput,
  output as ZodOutput,
  ZodTypeAny,
  ZodRawShape,
  ZodErrorMap,
  ZodLiteral,
  ZodNullable,
  ZodOptional,
  ZodDefault,
  ZodCatch,
} from "zod";

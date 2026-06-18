/**
 * Transitional Zod 4 exports for incremental package migrations.
 *
 * Keep the main @brains/utils zod export on the current repo default until
 * enough packages have moved. Import this subpath explicitly when a package is
 * intentionally being migrated to Zod 4 semantics.
 *
 * IMPORTANT: Do not use wildcard exports here as they cause TypeScript to load
 * all of Zod's complex types, creating millions of type instantiations.
 */

export { z as default } from "zod/v4";
export { z, ZodError } from "zod/v4";
export type { ZodSchema, ZodType } from "zod/v4";
export type {
  infer as ZodInfer,
  input as ZodInput,
  output as ZodOutput,
} from "zod/v4";

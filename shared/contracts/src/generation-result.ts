import { z } from "@brains/utils/zod";

/**
 * Base result schema for generation job handlers.
 * Extend with .extend() for plugin-specific fields (title, slug, etc.).
 */
export interface GenerationResult {
  success: boolean;
  entityId?: string | undefined;
  error?: string | undefined;
}

export const generationResultSchema: z.ZodObject<{
  success: z.ZodBoolean;
  entityId: z.ZodOptional<z.ZodString>;
  error: z.ZodOptional<z.ZodString>;
}> = z.object({
  success: z.boolean(),
  entityId: z.string().optional(),
  error: z.string().optional(),
});

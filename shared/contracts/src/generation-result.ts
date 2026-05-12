import { z } from "zod";

/**
 * Base result schema for generation job handlers.
 * Extend with .extend() for plugin-specific fields (title, slug, etc.).
 */
export const generationResultSchema = z.object({
  success: z.boolean(),
  entityId: z.string().optional(),
  error: z.string().optional(),
});

export type GenerationResult = z.infer<typeof generationResultSchema>;

import { z } from "@brains/utils/zod-v4";

/**
 * Note plugin configuration schema
 */
export const noteConfigSchema = z.object({
  defaultPrompt: z
    .string()
    .default("Create a note summarizing key concepts from my knowledge base"),
});

/**
 * Note plugin configuration type (output, with all defaults applied)
 */
export type NoteConfig = z.output<typeof noteConfigSchema>;

/**
 * Note plugin configuration input type (allows optional fields with defaults)
 */
export type NoteConfigInput = z.input<typeof noteConfigSchema>;

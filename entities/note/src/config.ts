import { z } from "@brains/utils/zod";

/**
 * The note package's settings, as the note plugin class took them; a brain
 * config naming one stays valid.
 */
export const noteConfigSchema: z.ZodObject<{
  defaultPrompt: z.ZodDefault<z.ZodString>;
}> = z.object({
  defaultPrompt: z
    .string()
    .default("Create a note summarizing key concepts from my knowledge base"),
});

/** Note plugin configuration type (output, with all defaults applied) */
export type NoteConfig = z.output<typeof noteConfigSchema>;

/** Note plugin configuration input type (allows optional fields with defaults) */
export type NoteConfigInput = z.input<typeof noteConfigSchema>;

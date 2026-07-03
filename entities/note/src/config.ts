import { z } from "@brains/utils/zod-v4";

/**
 * Note plugin configuration type (output, with all defaults applied)
 */
export interface NoteConfig {
  defaultPrompt: string;
}

/**
 * Note plugin configuration input type (allows optional fields with defaults)
 */
export interface NoteConfigInput {
  defaultPrompt?: string | undefined;
}

/**
 * Note plugin configuration schema
 */
export const noteConfigSchema: z.ZodType<NoteConfig, NoteConfigInput> =
  z.object({
    defaultPrompt: z
      .string()
      .default("Create a note summarizing key concepts from my knowledge base"),
  });

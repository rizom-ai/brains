import { z } from "@brains/utils";

/**
 * Notion plugin configuration.
 * Only requires a Notion integration token.
 */
export const notionConfigSchema = z.object({
  token: z.string().min(1),
});

export type NotionConfig = z.output<typeof notionConfigSchema>;
export type NotionConfigInput = z.input<typeof notionConfigSchema>;

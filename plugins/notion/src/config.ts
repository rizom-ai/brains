import { z } from "@brains/utils";

/**
 * Notion plugin configuration.
 * Only requires a Notion integration token.
 */
export const notionConfigSchema = z.object({
  /** Notion integration token (starts with ntn_ or secret_) */
  token: z.string(),
});

export type NotionConfig = z.infer<typeof notionConfigSchema>;

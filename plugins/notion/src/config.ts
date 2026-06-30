import { z } from "@brains/utils/zod-v4";

/**
 * Notion plugin configuration.
 * Only requires a Notion integration token.
 */
export interface NotionConfig {
  token: string;
}

export type NotionConfigInput = NotionConfig;

export const notionConfigSchema: z.ZodType<NotionConfig, NotionConfigInput> =
  z.object({
    token: z.string().min(1),
  });

import { z } from "@brains/utils/zod-v4";

/**
 * Link plugin configuration schema
 */
export interface LinkConfig {
  enableSummarization: boolean;
  jinaApiKey?: string | undefined;
}

export interface LinkConfigInput {
  enableSummarization?: boolean | undefined;
  jinaApiKey?: string | undefined;
}

export const linkConfigSchema: z.ZodType<LinkConfig, LinkConfigInput> =
  z.object({
    enableSummarization: z
      .boolean()
      .default(true)
      .describe("Generate AI summaries for captured links"),
    jinaApiKey: z
      .string()
      .optional()
      .describe(
        "Jina Reader API key for higher rate limits (500 RPM vs 20 RPM without key)",
      ),
  });

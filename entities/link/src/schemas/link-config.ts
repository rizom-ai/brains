import { z } from "@brains/utils/zod-v4";

/**
 * Link plugin configuration schema
 */
export const linkConfigSchema = z.object({
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

export type LinkConfig = z.output<typeof linkConfigSchema>;
export type LinkConfigInput = z.input<typeof linkConfigSchema>;

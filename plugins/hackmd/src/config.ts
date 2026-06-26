import { z } from "@brains/utils/zod-v4";

/**
 * HackMD plugin configuration.
 * Only requires a HackMD API token.
 */
export const hackmdConfigSchema = z.object({
  token: z.string().min(1),
});

export type HackMDConfig = z.output<typeof hackmdConfigSchema>;
export type HackMDConfigInput = z.input<typeof hackmdConfigSchema>;

import { z } from "@brains/utils";

/**
 * HackMD plugin configuration.
 * Only requires a HackMD API token.
 */
export const hackmdConfigSchema = z.object({
  token: z.string().min(1),
});

export type HackMDConfig = z.infer<typeof hackmdConfigSchema>;

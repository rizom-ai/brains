import { z } from "@brains/utils";

/**
 * HackMD plugin configuration.
 * Only requires a HackMD API token.
 */
export const hackmdConfigSchema = z.object({
  /** HackMD API token */
  token: z.string(),
});

export type HackMDConfig = z.infer<typeof hackmdConfigSchema>;

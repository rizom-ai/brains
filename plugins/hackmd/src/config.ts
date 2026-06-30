import { z } from "@brains/utils/zod-v4";

/**
 * HackMD plugin configuration.
 * Only requires a HackMD API token.
 */
export interface HackMDConfig {
  token: string;
}

export type HackMDConfigInput = HackMDConfig;

export const hackmdConfigSchema: z.ZodType<HackMDConfig, HackMDConfigInput> =
  z.object({
    token: z.string().min(1),
  });

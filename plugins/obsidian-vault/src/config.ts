import { z } from "@brains/utils/zod-v4";

export interface ObsidianVaultConfig {
  baseFolder: string;
}

export interface ObsidianVaultConfigInput {
  baseFolder?: string | undefined;
}

export const obsidianVaultConfigSchema: z.ZodType<
  ObsidianVaultConfig,
  ObsidianVaultConfigInput
> = z.object({
  baseFolder: z.string().default("_obsidian"),
});

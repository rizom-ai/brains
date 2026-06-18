import { z } from "@brains/utils";

export const obsidianVaultConfigSchema = z.object({
  baseFolder: z.string().default("_obsidian"),
});

export type ObsidianVaultConfig = z.output<typeof obsidianVaultConfigSchema>;
export type ObsidianVaultConfigInput = z.input<
  typeof obsidianVaultConfigSchema
>;

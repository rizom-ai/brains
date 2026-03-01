import { z } from "@brains/utils";

export const obsidianVaultConfigSchema = z.object({
  baseFolder: z.string().default("_obsidian"),
});

export type ObsidianVaultConfig = z.infer<typeof obsidianVaultConfigSchema>;

import { z } from "@brains/utils/zod";

export const obsidianVaultConfigSchema = z.object({
  baseFolder: z.string().default("_obsidian"),
});

export type ObsidianVaultConfig = z.infer<typeof obsidianVaultConfigSchema>;

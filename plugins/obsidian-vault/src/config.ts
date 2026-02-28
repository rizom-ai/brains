import { z } from "@brains/utils";

export const obsidianVaultConfigSchema = z.object({
  templateFolder: z.string().default("templates"),
  autoSync: z.boolean().default(false),
});

export type ObsidianVaultConfig = z.infer<typeof obsidianVaultConfigSchema>;

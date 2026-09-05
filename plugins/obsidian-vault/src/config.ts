import { z } from "@brains/utils/zod";

type ObsidianVaultConfigSchema = z.ZodObject<{
  baseFolder: z.ZodDefault<z.ZodString>;
}>;

export const obsidianVaultConfigSchema: ObsidianVaultConfigSchema = z.object({
  baseFolder: z.string().default("_obsidian"),
});

export type ObsidianVaultConfig = z.output<typeof obsidianVaultConfigSchema>;
export type ObsidianVaultConfigInput = z.input<
  typeof obsidianVaultConfigSchema
>;

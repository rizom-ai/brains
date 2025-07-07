import { z } from "zod";

export const cliConfigSchema = z.object({
  theme: z.object({
    primaryColor: z.string(),
    accentColor: z.string(),
  }),
});

export type CLIConfig = z.infer<typeof cliConfigSchema>;
export type CLIConfigInput = Partial<CLIConfig>;

import { z } from "zod";

export const cliConfigSchema = z.object({
  theme: z
    .object({
      primaryColor: z.string().optional(),
      accentColor: z.string().optional(),
    })
    .optional(),
  shortcuts: z.record(z.string()).optional(),
});

export type CLIConfig = z.infer<typeof cliConfigSchema>;

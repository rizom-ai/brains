import { z } from "@brains/utils";

/**
 * CLI configuration schema
 */
export const cliConfigSchema = z.object({
  theme: z
    .object({
      primaryColor: z
        .string()
        .describe("Primary color for the CLI theme")
        .default("#0066cc"),
      accentColor: z
        .string()
        .describe("Accent color for the CLI theme")
        .default("#ff6600"),
    })
    .describe("Theme configuration for the CLI interface")
    .default({
      primaryColor: "#0066cc",
      accentColor: "#ff6600",
    }),
});

export type CLIConfig = z.infer<typeof cliConfigSchema>;

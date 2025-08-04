import { z } from "zod";

/**
 * CLI configuration schema
 */
export const cliConfigSchema = z.object({
  theme: z
    .object({
      primaryColor: z.string().describe("Primary color for the CLI theme"),
      accentColor: z.string().describe("Accent color for the CLI theme"),
    })
    .describe("Theme configuration for the CLI interface"),
});

export type CLIConfig = z.infer<typeof cliConfigSchema>;
export type CLIConfigInput = Partial<CLIConfig>;

export const defaultCLIConfig: CLIConfig = {
  theme: {
    primaryColor: "#0066cc",
    accentColor: "#ff6600",
  },
};

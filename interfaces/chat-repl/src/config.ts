import { z } from "@brains/utils/zod-v4";

export interface CLIThemeConfig {
  primaryColor: string;
  accentColor: string;
}

export interface CLIConfig {
  theme: CLIThemeConfig;
}

export interface CLIConfigInput {
  theme?:
    | {
        primaryColor?: string | undefined;
        accentColor?: string | undefined;
      }
    | undefined;
}

/**
 * CLI configuration schema
 */
export const cliConfigSchema: z.ZodType<CLIConfig, CLIConfigInput> = z.object({
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

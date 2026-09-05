import { z } from "@brains/utils/zod";

type CLIThemeConfigSchema = z.ZodObject<{
  primaryColor: z.ZodDefault<z.ZodString>;
  accentColor: z.ZodDefault<z.ZodString>;
}>;

type CLIConfigSchema = z.ZodObject<{
  theme: z.ZodDefault<CLIThemeConfigSchema>;
}>;

/**
 * CLI configuration schema
 */
export const cliConfigSchema: CLIConfigSchema = z.object({
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

export type CLIConfig = z.output<typeof cliConfigSchema>;
export type CLIConfigInput = z.input<typeof cliConfigSchema>;
export type CLIThemeConfig = CLIConfig["theme"];

import { z } from "@brains/utils/zod";

interface EmailTriageConfigValue {
  instructions: string;
}

interface EmailTriageConfigInputValue {
  instructions?: string | undefined;
}

export const emailTriageConfigSchema: z.ZodType<
  EmailTriageConfigValue,
  EmailTriageConfigInputValue
> = z.object({
  instructions: z.string().max(4_000).default(""),
});

export type EmailTriageConfig = z.output<typeof emailTriageConfigSchema>;
export type EmailTriageConfigInput = z.input<typeof emailTriageConfigSchema>;

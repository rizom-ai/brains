import { z } from "@brains/utils/zod";

export const emailTriageConfigSchema: z.ZodType<
  Record<string, never>,
  Record<string, unknown>
> = z.strictObject({});

export type EmailTriageConfig = z.output<typeof emailTriageConfigSchema>;
export type EmailTriageConfigInput = z.input<typeof emailTriageConfigSchema>;

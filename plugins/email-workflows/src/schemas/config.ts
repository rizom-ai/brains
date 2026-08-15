import { z } from "@brains/utils/zod";

export const emailWorkflowsConfigSchema: z.ZodType<
  Record<string, never>,
  Record<string, unknown>
> = z.strictObject({});

export type EmailWorkflowsConfig = z.output<typeof emailWorkflowsConfigSchema>;
export type EmailWorkflowsConfigInput = z.input<
  typeof emailWorkflowsConfigSchema
>;

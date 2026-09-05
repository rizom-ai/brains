import { z } from "@brains/utils/zod";

type EmailWorkflowsConfigSchema = z.ZodObject<
  Record<never, never>,
  z.core.$strict
>;

export const emailWorkflowsConfigSchema: EmailWorkflowsConfigSchema =
  z.strictObject({});

export type EmailWorkflowsConfig = z.output<typeof emailWorkflowsConfigSchema>;
export type EmailWorkflowsConfigInput = z.input<
  typeof emailWorkflowsConfigSchema
>;

import { z } from "@brains/utils/zod";

type Strict<Shape extends z.ZodRawShape> = z.ZodObject<Shape, z.core.$strict>;

/** Server-owned limits, not a browser's requested model settings. */
export const guestExecutionLimitsSchema: Strict<{
  messageCharacters: z.ZodNumber;
  outputTokens: z.ZodNumber;
  contextTokens: z.ZodNumber;
  contextBytes: z.ZodNumber;
  toolSteps: z.ZodNumber;
  toolCalls: z.ZodNumber;
  toolResultCharacters: z.ZodNumber;
  requestTimeoutSeconds: z.ZodNumber;
}> = z.strictObject({
  messageCharacters: z.number().int().positive(),
  outputTokens: z.number().int().positive(),
  contextTokens: z.number().int().positive(),
  contextBytes: z.number().int().positive(),
  toolSteps: z.number().int().positive(),
  toolCalls: z.number().int().positive(),
  toolResultCharacters: z.number().int().positive(),
  requestTimeoutSeconds: z.number().int().positive().max(2_147_483),
});

export const guestExecutionPolicySchema: Strict<{
  limits: typeof guestExecutionLimitsSchema;
  maxCostMicroUsd: z.ZodNumber;
}> = z.strictObject({
  limits: guestExecutionLimitsSchema,
  maxCostMicroUsd: z.number().int().positive(),
});
export type GuestExecutionPolicy = z.output<typeof guestExecutionPolicySchema>;

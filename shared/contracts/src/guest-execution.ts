import { z } from "@brains/utils/zod";

type Strict<Shape extends z.ZodRawShape> = z.ZodObject<Shape, z.core.$strict>;

/** Server-owned limits, not a browser's requested model settings. */
export const guestExecutionLimitsSchema: Strict<{
  messageCharacters: z.ZodNumber;
  requestTimeoutSeconds: z.ZodNumber;
}> = z.strictObject({
  messageCharacters: z.number().int().positive(),
  requestTimeoutSeconds: z.number().int().positive().max(2_147_483),
});

export const guestExecutionPolicySchema: Strict<{
  limits: typeof guestExecutionLimitsSchema;
  maxCostMicroUsd: z.ZodNumber;
}> = z.strictObject({
  limits: guestExecutionLimitsSchema,
  /** The most one answer can cost within its limits: charged when its cost is unknown. */
  maxCostMicroUsd: z.number().int().positive(),
});
export type GuestExecutionPolicy = z.output<typeof guestExecutionPolicySchema>;

const tokens = z.number().int().nonnegative();

/** What the provider reported for a guest turn, summed across its calls. */
export const guestTurnUsageSchema: Strict<{
  modelCalls: z.ZodNumber;
  inputTokens: z.ZodNumber;
  cachedInputTokens: z.ZodNumber;
  outputTokens: z.ZodNumber;
  reasoningTokens: z.ZodNumber;
  embeddingTokens: z.ZodNumber;
}> = z.strictObject({
  modelCalls: tokens,
  inputTokens: tokens,
  cachedInputTokens: tokens,
  /** Includes reasoning, as the provider bills it. */
  outputTokens: tokens,
  reasoningTokens: tokens,
  embeddingTokens: tokens,
});
export type GuestTurnUsage = z.output<typeof guestTurnUsageSchema>;

/**
 * A turn's cost from provider usage at a pinned pricing revision. Computed
 * locally, not reconciled billing; a quote is never a known cost. Missing
 * usage or pricing the revision does not cover stays unknown.
 */
export const guestTurnCostSchema: z.ZodDiscriminatedUnion<
  [
    Strict<{
      state: z.ZodLiteral<"known">;
      microUsd: z.ZodNumber;
      pricing: z.ZodString;
    }>,
    Strict<{
      state: z.ZodLiteral<"unknown">;
      reason: z.ZodEnum<{
        "missing-usage": "missing-usage";
        "unsupported-pricing": "unsupported-pricing";
      }>;
    }>,
  ],
  "state"
> = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("known"),
    microUsd: z.number().int().nonnegative(),
    pricing: z.string().trim().min(1).max(120),
  }),
  z.strictObject({
    state: z.literal("unknown"),
    reason: z.enum(["missing-usage", "unsupported-pricing"]),
  }),
]);
export type GuestTurnCost = z.output<typeof guestTurnCostSchema>;

export const guestTurnSettlementSchema: Strict<{
  usage: typeof guestTurnUsageSchema;
  cost: typeof guestTurnCostSchema;
}> = z.strictObject({
  usage: guestTurnUsageSchema,
  cost: guestTurnCostSchema,
});
export type GuestTurnSettlement = z.output<typeof guestTurnSettlementSchema>;

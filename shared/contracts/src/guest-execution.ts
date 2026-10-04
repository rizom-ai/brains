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

/**
 * What a guest turn screens a visitor's question against, passed in by the
 * box's host beside its execution limits: the brain's public topics and the
 * owner's introduction as the site's scope, and the refusal a screened-out
 * visitor reads, in the site's words.
 */
export const guestScreeningSchema: Strict<{
  topics: z.ZodArray<z.ZodString>;
  introduction: z.ZodOptional<z.ZodString>;
  refusal: z.ZodOptional<z.ZodString>;
}> = z.strictObject({
  topics: z.array(z.string().trim().min(1).max(500)).max(20),
  introduction: z.string().trim().min(1).max(4000).optional(),
  refusal: z.string().trim().min(1).max(500).optional(),
});
export type GuestScreening = z.output<typeof guestScreeningSchema>;

/** A screening judgment: every category but `in-scope` refuses. */
export const guestScreeningCategorySchema: z.ZodEnum<{
  "in-scope": "in-scope";
  "off-topic": "off-topic";
  abusive: "abusive";
  injection: "injection";
  harmful: "harmful";
}> = z.enum(["in-scope", "off-topic", "abusive", "injection", "harmful"]);
export type GuestScreeningCategory = z.output<
  typeof guestScreeningCategorySchema
>;

/** The categories that refuse a question. */
export const guestRefusalCategorySchema: z.ZodEnum<{
  "off-topic": "off-topic";
  abusive: "abusive";
  injection: "injection";
  harmful: "harmful";
}> = guestScreeningCategorySchema.exclude(["in-scope"]);
export type GuestRefusalCategory = z.output<typeof guestRefusalCategorySchema>;

/**
 * What screening did with a guest turn: answered after an in-scope judgment,
 * refused with the category it was judged, or answered unscreened because
 * the judgment failed.
 */
export const guestScreeningOutcomeSchema: z.ZodDiscriminatedUnion<
  [
    Strict<{ outcome: z.ZodLiteral<"answered"> }>,
    Strict<{
      outcome: z.ZodLiteral<"refused">;
      category: typeof guestRefusalCategorySchema;
    }>,
    Strict<{ outcome: z.ZodLiteral<"unscreened"> }>,
  ],
  "outcome"
> = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("answered") }),
  z.strictObject({
    outcome: z.literal("refused"),
    category: guestRefusalCategorySchema,
  }),
  z.strictObject({ outcome: z.literal("unscreened") }),
]);
export type GuestScreeningOutcome = z.output<
  typeof guestScreeningOutcomeSchema
>;

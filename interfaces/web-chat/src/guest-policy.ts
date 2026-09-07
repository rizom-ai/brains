import { z } from "@brains/utils/zod";
import {
  guestExecutionLimitsSchema,
  guestRetentionSchema,
} from "@brains/contracts/chat";

const positiveInteger = z.number().int().positive();
const positiveAmount = z.number().positive();

type Strict<Shape extends z.ZodRawShape> = z.ZodObject<Shape, z.core.$strict>;

export const guestIssuanceLimitsSchema: Strict<{
  requestsPerMinute: z.ZodNumber;
  requestsPerDay: z.ZodNumber;
  maxStoredCredentials: z.ZodNumber;
}> = z
  .strictObject({
    requestsPerMinute: positiveInteger,
    requestsPerDay: positiveInteger,
    maxStoredCredentials: positiveInteger,
  })
  .refine(
    (limits) => limits.requestsPerMinute <= limits.requestsPerDay,
    "Guest issuance minute limit must fit the daily limit",
  );
export type GuestIssuanceLimits = z.output<typeof guestIssuanceLimitsSchema>;

const limitsSchema: Strict<
  typeof guestExecutionLimitsSchema.shape & {
    userTurns: z.ZodNumber;
    requestsPerMinute: z.ZodNumber;
    requestsPerDay: z.ZodNumber;
    globalRequestsPerMinute: z.ZodNumber;
    globalRequestsPerDay: z.ZodNumber;
    globalConcurrency: z.ZodNumber;
    streamIdleTimeoutSeconds: z.ZodNumber;
  }
> = z
  .strictObject({
    ...guestExecutionLimitsSchema.shape,
    userTurns: positiveInteger,
    requestsPerMinute: positiveInteger,
    requestsPerDay: positiveInteger,
    globalRequestsPerMinute: positiveInteger,
    globalRequestsPerDay: positiveInteger,
    globalConcurrency: positiveInteger,
    streamIdleTimeoutSeconds: positiveInteger,
  })
  .refine(
    (limits) =>
      limits.outputTokens < limits.contextTokens &&
      limits.requestsPerMinute <= limits.requestsPerDay &&
      limits.globalRequestsPerMinute <= limits.globalRequestsPerDay &&
      limits.streamIdleTimeoutSeconds <= limits.requestTimeoutSeconds,
    "Guest limits must have consistent token, rate and timeout bounds",
  );

const budgetSchema: Strict<{
  dailyUsd: z.ZodNumber;
  maxTurnUsd: z.ZodNumber;
}> = z
  .strictObject({
    dailyUsd: positiveAmount,
    maxTurnUsd: positiveAmount,
  })
  .refine(
    (budget) => budget.maxTurnUsd <= budget.dailyUsd,
    "Guest turn reservation must fit within the daily budget",
  );

/** Exact deployment origin; forwarded headers and browser claims cannot supply it. */
function isGuestOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password) return false;
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    );
  } catch {
    // A malformed deployment URL is a policy validation failure, not an origin.
    return false;
  }
}

const disabledPolicySchema: Strict<{ enabled: z.ZodLiteral<false> }> =
  z.strictObject({ enabled: z.literal(false) });
const enabledPolicySchema: Strict<{
  enabled: z.ZodLiteral<true>;
  origin: z.ZodString;
  issuance: typeof guestIssuanceLimitsSchema;
  limits: typeof limitsSchema;
  retention: typeof guestRetentionSchema;
  budget: typeof budgetSchema;
  disclosure: Strict<{
    provider: z.ZodString;
    notice: z.ZodString;
    deletionLimitations: z.ZodString;
  }>;
}> = z.strictObject({
  enabled: z.literal(true),
  origin: z
    .string()
    .refine(
      isGuestOrigin,
      "Guest origin must be canonical HTTPS (or loopback HTTP)",
    ),
  issuance: guestIssuanceLimitsSchema,
  limits: limitsSchema,
  retention: guestRetentionSchema,
  budget: budgetSchema,
  disclosure: z.strictObject({
    provider: z.string().trim().min(1),
    notice: z.string().trim().min(1),
    deletionLimitations: z.string().trim().min(1),
  }),
});

// No proposed launch limits become implicit defaults. Configuration alone is
// not admission: runtime isolation and atomic quota reservations remain gates.
export const guestPolicySchema: z.ZodDiscriminatedUnion<
  [typeof disabledPolicySchema, typeof enabledPolicySchema],
  "enabled"
> = z.discriminatedUnion("enabled", [
  disabledPolicySchema,
  enabledPolicySchema,
]);
export type GuestPolicy = z.output<typeof guestPolicySchema>;
export type EnabledGuestPolicy = Extract<GuestPolicy, { enabled: true }>;

import { z } from "@brains/utils/zod";
import { guestPolicySchema, type GuestPolicy } from "./guest-policy";

const localOriginSchema: z.ZodString = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (
      url.origin === value &&
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    );
  } catch {
    // A local preset must never silently admit an external deployment.
    return false;
  }
}, "The local-test preset requires a canonical loopback HTTP origin");

const localPresetSchema: z.ZodObject<
  {
    preset: z.ZodLiteral<"local-test">;
    origin: z.ZodDefault<z.ZodString>;
  },
  z.core.$strict
> = z.strictObject({
  preset: z.literal("local-test"),
  origin: localOriginSchema.default("http://127.0.0.1:8080"),
});

/**
 * Shared execution defaults. A hosted policy still needs explicit authorization,
 * and its owner's budget is the ceiling: these counts only stop floods, sized
 * well above what one site's visitors ask.
 */
export function createDefaultGuestPolicy(origin: string): GuestPolicy {
  return guestPolicySchema.parse({
    enabled: true,
    origin,
    issuance: {
      requestsPerMinute: 30,
      requestsPerDay: 1000,
      maxStoredCredentials: 300,
    },
    limits: {
      messageCharacters: 4000,
      userTurns: 10,
      requestsPerMinute: 6,
      requestsPerDay: 30,
      globalRequestsPerMinute: 30,
      globalRequestsPerDay: 300,
      globalConcurrency: 3,
      // One answer, with its lookups, well within three minutes.
      requestTimeoutSeconds: 180,
    },
    retention: { idleSeconds: 3600, maxAgeSeconds: 3600 },
    // An answer whose cost cannot be measured is charged maxTurnUsd. The daily
    // budget bounds a configured policy only.
    budget: { dailyUsd: 4, maxTurnUsd: 0.05 },
    usageRecord: {
      maxRecords: 1000,
      maxDenialRecords: 1000,
      retentionSeconds: 30 * 86_400,
      questionBytes: 16_000,
      maxStoredBytes: 4_000_000,
    },
    disclosure: {
      provider: "OpenAI (gpt-5.6-luna)",
      notice:
        (origin.startsWith("http://") ? "Local test only. " : "") +
        "Messages and retrieved public text reach this Brain and OpenAI. Do not send sensitive information. AI answers can be wrong. Conversations are not added to public knowledge. This session expires after one hour without renewal.",
      deletionLimitations:
        "Local deletion does not guarantee erasure from journals, backups, test artifacts, or provider and security logs. Usage reservations can remain.",
    },
  });
}

/** Author-facing configuration remains compact, including when serialized. */
export const guestPresetSchema: z.ZodUnion<
  [z.ZodLiteral<false>, z.ZodLiteral<"local-test">, typeof localPresetSchema]
> = z.union([z.literal(false), z.literal("local-test"), localPresetSchema]);

export function resolveGuestPreset(
  input: z.output<typeof guestPresetSchema>,
): GuestPolicy {
  if (input === false) return { enabled: false };
  return createDefaultGuestPolicy(
    localPresetSchema.parse(input === "local-test" ? { preset: input } : input)
      .origin,
  );
}

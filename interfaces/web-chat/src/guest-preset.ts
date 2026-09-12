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

/** Reviewed, bounded localhost trial; not a production guest policy. */
function localTestPolicy(origin: string): GuestPolicy {
  return guestPolicySchema.parse({
    enabled: true,
    origin,
    issuance: {
      requestsPerMinute: 2,
      requestsPerDay: 4,
      maxStoredCredentials: 4,
    },
    limits: {
      messageCharacters: 4000,
      outputTokens: 1200,
      contextTokens: 1_050_000,
      contextBytes: 32000,
      toolCalls: 3,
      userTurns: 2,
      toolSteps: 3,
      toolResultCharacters: 12000,
      retrieval: { rows: 5, rowBytes: 12000, queryCharacters: 4000 },
      requestsPerMinute: 2,
      requestsPerDay: 2,
      globalRequestsPerMinute: 2,
      globalRequestsPerDay: 2,
      globalConcurrency: 1,
      requestTimeoutSeconds: 90,
      streamIdleTimeoutSeconds: 30,
    },
    retention: { idleSeconds: 3600, maxAgeSeconds: 3600 },
    budget: { dailyUsd: 4, maxTurnUsd: 2 },
    disclosure: {
      provider: "OpenAI (gpt-5.6-luna)",
      notice:
        "Local test only. Messages and retrieved public text reach this Brain and OpenAI. Do not send sensitive information. AI answers can be wrong. Conversations are not added to public knowledge. This session expires after one hour without renewal.",
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
  return localTestPolicy(
    localPresetSchema.parse(input === "local-test" ? { preset: input } : input)
      .origin,
  );
}

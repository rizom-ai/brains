import { z } from "@brains/utils/zod";

type AtprotoJetstreamConfigSchema = z.ZodObject<
  {
    enabled: z.ZodDefault<z.ZodBoolean>;
    endpoint: z.ZodDefault<z.ZodURL>;
    replayWindowSeconds: z.ZodDefault<z.ZodNumber>;
    denyDids: z.ZodDefault<z.ZodArray<z.ZodString>>;
    denyDomains: z.ZodDefault<z.ZodArray<z.ZodString>>;
    skillKeywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
    queueLimit: z.ZodDefault<z.ZodNumber>;
    concurrency: z.ZodDefault<z.ZodNumber>;
    perDidCooldownSeconds: z.ZodDefault<z.ZodNumber>;
    fetchBudgetPerMinute: z.ZodDefault<z.ZodNumber>;
    newAgentsPerHour: z.ZodDefault<z.ZodNumber>;
    pendingCandidateCeiling: z.ZodDefault<z.ZodNumber>;
    staleCandidateRetentionDays: z.ZodDefault<z.ZodNumber>;
    requestTimeoutMs: z.ZodDefault<z.ZodNumber>;
    maxResponseBytes: z.ZodDefault<z.ZodNumber>;
    maxRedirects: z.ZodDefault<z.ZodNumber>;
    retryAttempts: z.ZodDefault<z.ZodNumber>;
    heartbeatIntervalHours: z.ZodDefault<z.ZodNumber>;
  },
  z.core.$strict
>;

export const atprotoJetstreamConfigSchema: AtprotoJetstreamConfigSchema = z
  .object({
    enabled: z
      .boolean()
      .default(false)
      .describe("Opt in to bounded Jetstream brain-card discovery"),
    endpoint: z
      .url()
      .refine((value) => new URL(value).protocol === "wss:", {
        message: "Jetstream endpoint must use wss",
      })
      .default("wss://jetstream2.us-east.bsky.network/subscribe"),
    replayWindowSeconds: z
      .number()
      .int()
      .min(60)
      .max(7 * 24 * 60 * 60)
      .default(6 * 60 * 60),
    denyDids: z.array(z.string().startsWith("did:plc:")).default([]),
    denyDomains: z.array(z.string().min(1)).default([]),
    skillKeywords: z.array(z.string().min(1)).default([]),
    queueLimit: z.number().int().min(1).max(10_000).default(256),
    concurrency: z.number().int().min(1).max(32).default(2),
    perDidCooldownSeconds: z
      .number()
      .int()
      .min(0)
      .max(24 * 60 * 60)
      .default(5 * 60),
    fetchBudgetPerMinute: z.number().int().min(1).max(10_000).default(60),
    newAgentsPerHour: z.number().int().min(1).max(10_000).default(20),
    pendingCandidateCeiling: z.number().int().min(1).max(100_000).default(200),
    staleCandidateRetentionDays: z.number().int().min(1).max(3650).default(30),
    requestTimeoutMs: z.number().int().min(100).max(120_000).default(10_000),
    maxResponseBytes: z
      .number()
      .int()
      .min(1024)
      .max(10 * 1024 * 1024)
      .default(256 * 1024),
    maxRedirects: z.number().int().min(0).max(10).default(3),
    retryAttempts: z.number().int().min(1).max(10).default(3),
    heartbeatIntervalHours: z
      .number()
      .min(1)
      .max(7 * 24)
      .default(24),
  })
  .strict();

export type AtprotoJetstreamConfig = z.output<
  typeof atprotoJetstreamConfigSchema
>;
export type AtprotoJetstreamConfigInput = z.input<
  typeof atprotoJetstreamConfigSchema
>;

const defaultJetstreamConfig = atprotoJetstreamConfigSchema.parse({});

type AtprotoConfigSchema = z.ZodObject<{
  enabled: z.ZodDefault<z.ZodBoolean>;
  pdsEndpoint: z.ZodDefault<z.ZodURL>;
  identifier: z.ZodOptional<z.ZodString>;
  repoDid: z.ZodOptional<z.ZodString>;
  appPassword: z.ZodOptional<z.ZodString>;
  anchorDid: z.ZodOptional<z.ZodString>;
  brainDid: z.ZodOptional<z.ZodString>;
  accountDid: z.ZodOptional<z.ZodString>;
  lexiconAuthority: z.ZodDefault<z.ZodBoolean>;
  jetstream: z.ZodDefault<AtprotoJetstreamConfigSchema>;
}>;

export const atprotoConfigSchema: AtprotoConfigSchema = z.object({
  enabled: z.boolean().default(true),
  pdsEndpoint: z
    .url()
    .default("https://bsky.social")
    .describe("AT Protocol PDS service endpoint"),
  identifier: z
    .string()
    .optional()
    .describe("PDS login identifier, usually a handle or account DID"),
  repoDid: z
    .string()
    .optional()
    .describe("DID of the PDS repo that owns records"),
  appPassword: z
    .string()
    .optional()
    .describe(
      "App password for prototype authentication; supply via ${ENV_VAR} interpolation, never a committed literal",
    ),
  anchorDid: z
    .string()
    .optional()
    .describe(
      "Optional Anchor DID referenced from records; defaults to did:web:<site-host>:anchor with web, otherwise accountDid or the PDS repo DID",
    ),
  brainDid: z
    .string()
    .optional()
    .describe(
      "Optional public brain DID referenced from records; defaults to did:web:<site-host> with web, otherwise the PDS repo DID",
    ),
  accountDid: z
    .string()
    .optional()
    .describe(
      "Owner's atproto account DID (did:plc:…). When set, the brain serves it at /.well-known/atproto-did so the owner's handle can verify against this domain (HTTP method) — member handles under the fleet domain",
    ),
  lexiconAuthority: z
    .boolean()
    .default(false)
    .describe(
      "Publish canonical ai.rizom.brain.* schemas from this PDS repo; enable only for the DNS-designated lexicon authority account",
    ),
  jetstream: atprotoJetstreamConfigSchema.default(defaultJetstreamConfig),
});

export type AtprotoConfig = z.output<typeof atprotoConfigSchema>;
export type AtprotoConfigInput = z.input<typeof atprotoConfigSchema>;

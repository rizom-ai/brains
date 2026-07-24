import { z } from "@brains/utils/zod";

export interface AtprotoJetstreamConfig {
  enabled: boolean;
  endpoint: string;
  replayWindowSeconds: number;
  denyDids: string[];
  denyDomains: string[];
  skillKeywords: string[];
  queueLimit: number;
  concurrency: number;
  perDidCooldownSeconds: number;
  fetchBudgetPerMinute: number;
  newAgentsPerHour: number;
  pendingCandidateCeiling: number;
  staleCandidateRetentionDays: number;
  requestTimeoutMs: number;
  maxResponseBytes: number;
  maxRedirects: number;
  retryAttempts: number;
  heartbeatIntervalHours: number;
}

export interface AtprotoJetstreamConfigInput {
  enabled?: boolean | undefined;
  endpoint?: string | undefined;
  replayWindowSeconds?: number | undefined;
  denyDids?: string[] | undefined;
  denyDomains?: string[] | undefined;
  skillKeywords?: string[] | undefined;
  queueLimit?: number | undefined;
  concurrency?: number | undefined;
  perDidCooldownSeconds?: number | undefined;
  fetchBudgetPerMinute?: number | undefined;
  newAgentsPerHour?: number | undefined;
  pendingCandidateCeiling?: number | undefined;
  staleCandidateRetentionDays?: number | undefined;
  requestTimeoutMs?: number | undefined;
  maxResponseBytes?: number | undefined;
  maxRedirects?: number | undefined;
  retryAttempts?: number | undefined;
  heartbeatIntervalHours?: number | undefined;
}

export const atprotoJetstreamConfigSchema: z.ZodType<
  AtprotoJetstreamConfig,
  AtprotoJetstreamConfigInput
> = z
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

const defaultJetstreamConfig = atprotoJetstreamConfigSchema.parse({});

export interface AtprotoConfig {
  enabled: boolean;
  pdsEndpoint: string;
  identifier?: string | undefined;
  repoDid?: string | undefined;
  appPassword?: string | undefined;
  anchorDid?: string | undefined;
  brainDid?: string | undefined;
  accountDid?: string | undefined;
  lexiconAuthority: boolean;
  jetstream: AtprotoJetstreamConfig;
}

export interface AtprotoConfigInput {
  enabled?: boolean | undefined;
  pdsEndpoint?: string | undefined;
  identifier?: string | undefined;
  repoDid?: string | undefined;
  appPassword?: string | undefined;
  anchorDid?: string | undefined;
  brainDid?: string | undefined;
  accountDid?: string | undefined;
  lexiconAuthority?: boolean | undefined;
  jetstream?: AtprotoJetstreamConfigInput | undefined;
}

export const atprotoConfigSchema: z.ZodType<AtprotoConfig, AtprotoConfigInput> =
  z.object({
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
        "Optional human/operator DID referenced from records; defaults to did:web:<site-host>:anchor when omitted",
      ),
    brainDid: z
      .string()
      .optional()
      .describe(
        "Optional public brain DID referenced from records; defaults to did:web:<site-host> when omitted",
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

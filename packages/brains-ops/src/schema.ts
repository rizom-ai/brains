import { z } from "@brains/utils/zod";

const exactVersionPattern: RegExp =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const handlePattern: RegExp = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const exactVersionSchema: z.ZodString = z
  .string()
  .regex(exactVersionPattern, "expected exact pinned version");
export const handleSchema: z.ZodString = z
  .string()
  .regex(handlePattern, "expected lowercase handle slug");
export const secretNameSchema: z.ZodString = z.string().min(1);
export const agePublicKeySchema: z.ZodString = z
  .string()
  .startsWith("age1")
  .min(1);

export const canonicalBundleIdSchema: z.ZodEnum<{
  core: "core";
  site: "site";
  publishing: "publishing";
  team: "team";
}> = z.enum(["core", "site", "publishing", "team"]);
export type CanonicalBundleId = z.output<typeof canonicalBundleIdSchema>;

export interface PilotConfig {
  brainVersion: string;
  bundles: CanonicalBundleId[];
  add?: string[] | undefined;
  remove?: string[] | undefined;
  githubOrg: string;
  contentRepoPrefix: string;
  domainSuffix: string;
  aiApiKey: string;
  gitSyncToken: string;
  contentRepoAdminToken: string;
  agePublicKey: string;
}

export interface SiteOverrideConfig {
  package: string;
  version: string;
  theme?: string | undefined;
  themeVersion?: string | undefined;
}

export interface CohortConfig {
  members: string[];
  brainVersionOverride?: string | undefined;
  bundlesOverride?: CanonicalBundleId[] | undefined;
  addOverride?: string[] | undefined;
  removeOverride?: string[] | undefined;
  aiApiKeyOverride?: string | undefined;
  gitSyncTokenOverride?: string | undefined;
}

const canonicalBundlesSchema = z.array(canonicalBundleIdSchema).min(1);
const memberIdsSchema = z.array(z.string().min(1));

/** Sole active desired-state contract for the canonical brain. */
export const pilotSchema: z.ZodType<PilotConfig> = z
  .strictObject({
    brainVersion: exactVersionSchema,
    bundles: canonicalBundlesSchema,
    add: memberIdsSchema.optional(),
    remove: memberIdsSchema.optional(),
    githubOrg: z.string().min(1),
    contentRepoPrefix: z.string().min(1),
    domainSuffix: z.string().min(1),
    aiApiKey: secretNameSchema,
    gitSyncToken: secretNameSchema,
    contentRepoAdminToken: secretNameSchema,
    agePublicKey: agePublicKeySchema,
  })
  .superRefine((value, context) => {
    if (new Set(value.bundles).size !== value.bundles.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bundles"],
        message: "canonical bundles must be unique",
      });
    }
  });

export const cohortSchema: z.ZodType<CohortConfig> = z
  .strictObject({
    members: z.array(handleSchema).min(1),
    brainVersionOverride: exactVersionSchema.optional(),
    bundlesOverride: canonicalBundlesSchema.optional(),
    addOverride: memberIdsSchema.optional(),
    removeOverride: memberIdsSchema.optional(),
    aiApiKeyOverride: secretNameSchema.optional(),
    gitSyncTokenOverride: secretNameSchema.optional(),
  })
  .superRefine((value, context) => {
    if (new Set(value.members).size !== value.members.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["members"],
        message: "cohort members must be unique",
      });
    }
    if (
      value.bundlesOverride &&
      new Set(value.bundlesOverride).size !== value.bundlesOverride.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bundlesOverride"],
        message: "canonical bundle overrides must be unique",
      });
    }
  });

const anchorProfileSocialLinkSchema: z.ZodObject<{
  platform: z.ZodEnum<{
    github: "github";
    instagram: "instagram";
    linkedin: "linkedin";
    email: "email";
    website: "website";
  }>;
  url: z.ZodString;
  label: z.ZodOptional<z.ZodString>;
}> = z.strictObject({
  platform: z.enum(["github", "instagram", "linkedin", "email", "website"]),
  url: z.string().min(1),
  label: z.string().min(1).optional(),
});

const anchorProfileSchema: z.ZodObject<{
  name: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodString>;
  website: z.ZodOptional<z.ZodString>;
  email: z.ZodOptional<z.ZodString>;
  story: z.ZodOptional<z.ZodString>;
  socialLinks: z.ZodOptional<z.ZodArray<typeof anchorProfileSocialLinkSchema>>;
}> = z.strictObject({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  website: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  story: z.string().min(1).optional(),
  socialLinks: z.array(anchorProfileSocialLinkSchema).optional(),
});

const setupDeliverySchema: z.ZodObject<{
  delivery: z.ZodLiteral<"email">;
  email: z.ZodString;
}> = z.strictObject({
  delivery: z.literal("email"),
  email: z.string().email(),
});

const atprotoJetstreamSchema: z.ZodObject<{
  enabled: z.ZodOptional<z.ZodBoolean>;
  endpoint: z.ZodOptional<z.ZodString>;
  replayWindowSeconds: z.ZodOptional<z.ZodNumber>;
  denyDids: z.ZodOptional<z.ZodArray<z.ZodString>>;
  denyDomains: z.ZodOptional<z.ZodArray<z.ZodString>>;
  skillKeywords: z.ZodOptional<z.ZodArray<z.ZodString>>;
  queueLimit: z.ZodOptional<z.ZodNumber>;
  concurrency: z.ZodOptional<z.ZodNumber>;
  perDidCooldownSeconds: z.ZodOptional<z.ZodNumber>;
  fetchBudgetPerMinute: z.ZodOptional<z.ZodNumber>;
  newAgentsPerHour: z.ZodOptional<z.ZodNumber>;
  pendingCandidateCeiling: z.ZodOptional<z.ZodNumber>;
  staleCandidateRetentionDays: z.ZodOptional<z.ZodNumber>;
  requestTimeoutMs: z.ZodOptional<z.ZodNumber>;
  maxResponseBytes: z.ZodOptional<z.ZodNumber>;
  maxRedirects: z.ZodOptional<z.ZodNumber>;
  retryAttempts: z.ZodOptional<z.ZodNumber>;
  heartbeatIntervalHours: z.ZodOptional<z.ZodNumber>;
}> = z.strictObject({
  enabled: z.boolean().optional(),
  endpoint: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === "wss:", {
      message: "Jetstream endpoint must use wss",
    })
    .optional(),
  replayWindowSeconds: z.number().int().min(60).optional(),
  denyDids: z.array(z.string().startsWith("did:plc:")).optional(),
  denyDomains: z.array(z.string().min(1)).optional(),
  skillKeywords: z.array(z.string().min(1)).optional(),
  queueLimit: z.number().int().min(1).max(10_000).optional(),
  concurrency: z.number().int().min(1).max(32).optional(),
  perDidCooldownSeconds: z.number().int().nonnegative().optional(),
  fetchBudgetPerMinute: z.number().int().min(1).optional(),
  newAgentsPerHour: z.number().int().min(1).optional(),
  pendingCandidateCeiling: z.number().int().min(1).optional(),
  staleCandidateRetentionDays: z.number().int().min(1).optional(),
  requestTimeoutMs: z.number().int().min(100).optional(),
  maxResponseBytes: z.number().int().min(1024).optional(),
  maxRedirects: z.number().int().nonnegative().optional(),
  retryAttempts: z.number().int().min(1).optional(),
  heartbeatIntervalHours: z.number().min(1).optional(),
});

const atprotoSchema: z.ZodObject<{
  identifier: z.ZodString;
  accountDid: z.ZodOptional<z.ZodString>;
  lexiconAuthority: z.ZodOptional<z.ZodBoolean>;
  jetstream: z.ZodOptional<typeof atprotoJetstreamSchema>;
}> = z.strictObject({
  identifier: z.string().min(1),
  accountDid: z.string().min(1).optional(),
  lexiconAuthority: z.boolean().optional(),
  jetstream: atprotoJetstreamSchema.optional(),
});

export const siteOverrideSchema: z.ZodType<SiteOverrideConfig> = z
  .strictObject({
    package: z.string().min(1),
    version: exactVersionSchema,
    theme: z.string().min(1).optional(),
    themeVersion: exactVersionSchema.optional(),
  })
  .superRefine((value, context) => {
    const hasExternalTheme = value.theme?.startsWith("@rizom/") === true;
    if (hasExternalTheme && value.themeVersion === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["themeVersion"],
        message: "external @rizom themes require an exact version pin",
      });
    }
    if (!hasExternalTheme && value.themeVersion !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["themeVersion"],
        message: "themeVersion is valid only for external @rizom themes",
      });
    }
  });

const playbooksSchema: z.ZodObject<{
  onboarding: z.ZodOptional<z.ZodBoolean>;
}> = z.strictObject({
  onboarding: z.boolean().optional(),
});

export const userSchema: z.ZodObject<{
  handle: z.ZodString;
  discord: z.ZodObject<{
    enabled: z.ZodBoolean;
    anchorUserId: z.ZodOptional<z.ZodString>;
  }>;
  aiApiKeyOverride: z.ZodOptional<z.ZodString>;
  gitSyncTokenOverride: z.ZodOptional<z.ZodString>;
  domainOverride: z.ZodOptional<z.ZodString>;
  cloudflareZoneId: z.ZodOptional<z.ZodString>;
  contentRepoOverride: z.ZodOptional<z.ZodString>;
  profileKind: z.ZodOptional<z.ZodString>;
  addOverride: z.ZodOptional<z.ZodArray<z.ZodString>>;
  removeOverride: z.ZodOptional<z.ZodArray<z.ZodString>>;
  siteOverride: z.ZodOptional<typeof siteOverrideSchema>;
  setup: z.ZodOptional<typeof setupDeliverySchema>;
  atproto: z.ZodOptional<typeof atprotoSchema>;
  playbooks: z.ZodOptional<typeof playbooksSchema>;
  anchorProfile: z.ZodOptional<typeof anchorProfileSchema>;
}> = z.strictObject({
  handle: handleSchema,
  discord: z.strictObject({
    enabled: z.boolean(),
    anchorUserId: z.string().min(1).optional(),
  }),
  aiApiKeyOverride: secretNameSchema.optional(),
  gitSyncTokenOverride: secretNameSchema.optional(),
  domainOverride: z.string().min(1).optional(),
  cloudflareZoneId: z.string().min(1).optional(),
  contentRepoOverride: z.string().min(1).optional(),
  profileKind: z.string().trim().min(1).optional(),
  addOverride: z.array(z.string().min(1)).optional(),
  removeOverride: z.array(z.string().min(1)).optional(),
  siteOverride: siteOverrideSchema.optional(),
  setup: setupDeliverySchema.optional(),
  atproto: atprotoSchema.optional(),
  playbooks: playbooksSchema.optional(),
  anchorProfile: anchorProfileSchema.optional(),
});

export type PilotConfigInput = z.input<typeof pilotSchema>;
export type UserConfig = z.output<typeof userSchema>;
export type UserConfigInput = z.input<typeof userSchema>;
export type CohortConfigInput = z.input<typeof cohortSchema>;

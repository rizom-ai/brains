import { z } from "@brains/utils/zod";

const exactVersionPattern: RegExp =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const handlePattern: RegExp = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const presetSchema: z.ZodEnum<{
  core: "core";
  default: "default";
  pro: "pro";
}> = z.enum(["core", "default", "pro"]);
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

export const pilotSchema: z.ZodObject<{
  schemaVersion: z.ZodLiteral<1>;
  brainVersion: z.ZodString;
  model: z.ZodLiteral<"rover">;
  githubOrg: z.ZodString;
  contentRepoPrefix: z.ZodString;
  domainSuffix: z.ZodString;
  preset: typeof presetSchema;
  aiApiKey: z.ZodString;
  gitSyncToken: z.ZodString;
  contentRepoAdminToken: z.ZodString;
  agePublicKey: z.ZodString;
}> = z.strictObject({
  schemaVersion: z.literal(1),
  brainVersion: exactVersionSchema,
  model: z.literal("rover"),
  githubOrg: z.string().min(1),
  contentRepoPrefix: z.string().min(1),
  domainSuffix: z.string().min(1),
  preset: presetSchema,
  aiApiKey: secretNameSchema,
  gitSyncToken: secretNameSchema,
  contentRepoAdminToken: secretNameSchema,
  agePublicKey: agePublicKeySchema,
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

const atprotoSchema: z.ZodObject<{
  identifier: z.ZodString;
}> = z.strictObject({
  identifier: z.string().min(1),
});

const siteOverrideSchema: z.ZodObject<{
  package: z.ZodString;
  version: typeof exactVersionSchema;
  theme: z.ZodOptional<z.ZodString>;
}> = z.strictObject({
  package: z.string().min(1),
  version: exactVersionSchema,
  theme: z.string().min(1).optional(),
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
  addOverride: z.ZodOptional<z.ZodArray<z.ZodString>>;
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
  addOverride: z.array(z.string().min(1)).optional(),
  siteOverride: siteOverrideSchema.optional(),
  setup: setupDeliverySchema.optional(),
  atproto: atprotoSchema.optional(),
  playbooks: playbooksSchema.optional(),
  anchorProfile: anchorProfileSchema.optional(),
});

export const cohortSchema: z.ZodObject<{
  members: z.ZodArray<z.ZodString>;
  brainVersionOverride: z.ZodOptional<z.ZodString>;
  presetOverride: z.ZodOptional<typeof presetSchema>;
  aiApiKeyOverride: z.ZodOptional<z.ZodString>;
  gitSyncTokenOverride: z.ZodOptional<z.ZodString>;
}> = z
  .strictObject({
    members: z.array(handleSchema).min(1),
    brainVersionOverride: exactVersionSchema.optional(),
    presetOverride: presetSchema.optional(),
    aiApiKeyOverride: secretNameSchema.optional(),
    gitSyncTokenOverride: secretNameSchema.optional(),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();

    for (const member of value.members) {
      if (seen.has(member)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["members"],
          message: `duplicate cohort member: ${member}`,
        });
        continue;
      }

      seen.add(member);
    }
  });

export type PilotConfig = z.output<typeof pilotSchema>;
export type PilotConfigInput = z.input<typeof pilotSchema>;
export type UserConfig = z.output<typeof userSchema>;
export type UserConfigInput = z.input<typeof userSchema>;
export type CohortConfig = z.output<typeof cohortSchema>;
export type CohortConfigInput = z.input<typeof cohortSchema>;
export type PilotPreset = z.output<typeof presetSchema>;

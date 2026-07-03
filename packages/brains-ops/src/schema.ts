import { z } from "@brains/utils/zod-v4";

const exactVersionPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const handlePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const presetSchema = z.enum(["core", "default", "pro"]);
export const exactVersionSchema = z
  .string()
  .regex(exactVersionPattern, "expected exact pinned version");
export const handleSchema = z
  .string()
  .regex(handlePattern, "expected lowercase handle slug");
export const secretNameSchema = z.string().min(1);
export const agePublicKeySchema = z.string().startsWith("age1").min(1);

export const pilotSchema = z.strictObject({
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

const anchorProfileSocialLinkSchema = z.strictObject({
  platform: z.enum(["github", "instagram", "linkedin", "email", "website"]),
  url: z.string().min(1),
  label: z.string().min(1).optional(),
});

const anchorProfileSchema = z.strictObject({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  website: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  story: z.string().min(1).optional(),
  socialLinks: z.array(anchorProfileSocialLinkSchema).optional(),
});

const setupDeliverySchema = z.strictObject({
  delivery: z.literal("email"),
  email: z.string().email(),
});

const atprotoSchema = z.strictObject({
  identifier: z.string().min(1),
});

const playbooksSchema = z.strictObject({
  onboarding: z.boolean().optional(),
});

export const userSchema = z.strictObject({
  handle: handleSchema,
  discord: z.strictObject({
    enabled: z.boolean(),
    anchorUserId: z.string().min(1).optional(),
  }),
  aiApiKeyOverride: secretNameSchema.optional(),
  gitSyncTokenOverride: secretNameSchema.optional(),
  setup: setupDeliverySchema.optional(),
  atproto: atprotoSchema.optional(),
  playbooks: playbooksSchema.optional(),
  anchorProfile: anchorProfileSchema.optional(),
});

export const cohortSchema = z
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

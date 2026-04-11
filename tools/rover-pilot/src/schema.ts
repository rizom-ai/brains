import { z } from "zod";

const exactVersionPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const handlePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const presetSchema = z.enum(["core", "pro"]);
export const exactVersionSchema = z
  .string()
  .regex(exactVersionPattern, "expected exact pinned version");
export const handleSchema = z
  .string()
  .regex(handlePattern, "expected lowercase handle slug");

export const pilotSchema = z
  .object({
    schemaVersion: z.literal(1),
    brainVersion: exactVersionSchema,
    model: z.literal("rover"),
    githubOrg: z.string().min(1),
    repoPrefix: z.string().min(1),
    contentRepoSuffix: z.string().min(1),
    domainSuffix: z.string().min(1),
    preset: presetSchema,
  })
  .strict();

export const userSchema = z
  .object({
    handle: handleSchema,
    discord: z
      .object({
        enabled: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const cohortSchema = z
  .object({
    members: z.array(handleSchema).min(1),
    brainVersionOverride: exactVersionSchema.optional(),
    presetOverride: presetSchema.optional(),
  })
  .strict()
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

export type PilotConfig = z.infer<typeof pilotSchema>;
export type UserConfig = z.infer<typeof userSchema>;
export type CohortConfig = z.infer<typeof cohortSchema>;
export type PilotPreset = z.infer<typeof presetSchema>;

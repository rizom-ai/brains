import {
  anchorProfileBodySchema,
  EntityValidationError,
  parseMarkdownWithFrontmatter,
  type ProfileCategory,
  type ProfileKindDefinition,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

export interface CommonProfileExtension {
  tagline?: string | undefined;
  intro?: string | undefined;
  story?: string | undefined;
  audience?: string | undefined;
}

export type CommonProfileExtensionSchema = z.ZodObject<{
  tagline: z.ZodOptional<z.ZodString>;
  intro: z.ZodOptional<z.ZodString>;
  story: z.ZodOptional<z.ZodString>;
  audience: z.ZodOptional<z.ZodString>;
}>;

export const commonProfileExtension: CommonProfileExtensionSchema = z.object({
  tagline: z.string().optional().describe("Short public profile tagline"),
  intro: z.string().optional().describe("Longer public profile introduction"),
  story: z
    .string()
    .optional()
    .describe("Extended profile narrative sourced from the markdown body"),
  audience: z
    .string()
    .optional()
    .describe("Primary audience or community served"),
});

export type ProfileBaseFrontmatterExtension = z.ZodObject<{
  tagline: z.ZodOptional<z.ZodString>;
  intro: z.ZodOptional<z.ZodString>;
  audience: z.ZodOptional<z.ZodString>;
}>;

export const profileBaseFrontmatterExtension: ProfileBaseFrontmatterExtension =
  z.object({
    tagline: commonProfileExtension.shape.tagline,
    intro: commonProfileExtension.shape.intro,
    audience: commonProfileExtension.shape.audience,
  });

export type ProfessionalProfileFieldsSchema = z.ZodObject<{
  role: z.ZodOptional<z.ZodString>;
  expertise: z.ZodOptional<z.ZodArray<z.ZodString>>;
  currentFocus: z.ZodOptional<z.ZodString>;
  availability: z.ZodOptional<z.ZodString>;
}>;

export const professionalProfileFields: ProfessionalProfileFieldsSchema =
  z.object({
    role: z
      .string()
      .optional()
      .describe("Professional role or working identity"),
    expertise: z
      .array(z.string())
      .optional()
      .describe("Skills, domains, and areas of focus"),
    currentFocus: z
      .string()
      .optional()
      .describe("What the professional is currently working on"),
    availability: z
      .string()
      .optional()
      .describe("Work, speaking, or collaboration availability"),
  });

export interface ProfessionalProfileExtension extends CommonProfileExtension {
  role?: string | undefined;
  expertise?: string[] | undefined;
  currentFocus?: string | undefined;
  availability?: string | undefined;
}

export type ProfessionalProfileExtensionSchema = ReturnType<
  typeof commonProfileExtension.extend<ProfessionalProfileFieldsSchema["shape"]>
>;

export const professionalProfileExtension: ProfessionalProfileExtensionSchema =
  commonProfileExtension.extend(professionalProfileFields.shape);

export type TeamProfileFieldsSchema = z.ZodObject<{
  purpose: z.ZodOptional<z.ZodString>;
  focusAreas: z.ZodOptional<z.ZodArray<z.ZodString>>;
  capabilities: z.ZodOptional<z.ZodArray<z.ZodString>>;
  workingPrinciples: z.ZodOptional<z.ZodArray<z.ZodString>>;
}>;

export const teamProfileFields: TeamProfileFieldsSchema = z.object({
  purpose: z.string().optional().describe("Team purpose"),
  focusAreas: z.array(z.string()).optional().describe("Team focus areas"),
  capabilities: z.array(z.string()).optional().describe("Team capabilities"),
  workingPrinciples: z
    .array(z.string())
    .optional()
    .describe("Principles guiding how the team works"),
});

export interface TeamProfileExtension extends CommonProfileExtension {
  purpose?: string | undefined;
  focusAreas?: string[] | undefined;
  capabilities?: string[] | undefined;
  workingPrinciples?: string[] | undefined;
}

export type TeamProfileExtensionSchema = ReturnType<
  typeof commonProfileExtension.extend<TeamProfileFieldsSchema["shape"]>
>;

export const teamProfileExtension: TeamProfileExtensionSchema =
  commonProfileExtension.extend(teamProfileFields.shape);

export type OrganizationProfileFieldsSchema = z.ZodObject<{
  mission: z.ZodOptional<z.ZodString>;
  focusAreas: z.ZodOptional<z.ZodArray<z.ZodString>>;
  offerings: z.ZodOptional<z.ZodArray<z.ZodString>>;
  values: z.ZodOptional<z.ZodArray<z.ZodString>>;
}>;

export const organizationProfileFields: OrganizationProfileFieldsSchema =
  z.object({
    mission: z.string().optional().describe("Organization mission"),
    focusAreas: z
      .array(z.string())
      .optional()
      .describe("Organization focus areas"),
    offerings: z
      .array(z.string())
      .optional()
      .describe("Organization products, services, or programs"),
    values: z.array(z.string()).optional().describe("Organization values"),
  });

export interface OrganizationProfileExtension extends CommonProfileExtension {
  mission?: string | undefined;
  focusAreas?: string[] | undefined;
  offerings?: string[] | undefined;
  values?: string[] | undefined;
}

export type OrganizationProfileExtensionSchema = ReturnType<
  typeof commonProfileExtension.extend<OrganizationProfileFieldsSchema["shape"]>
>;

export const organizationProfileExtension: OrganizationProfileExtensionSchema =
  commonProfileExtension.extend(organizationProfileFields.shape);

type ProfessionalProfileSchema = ReturnType<
  ReturnType<
    typeof anchorProfileBodySchema.extend<
      ProfessionalProfileExtensionSchema["shape"]
    >
  >["strict"]
>;
export const professionalProfileSchema: ProfessionalProfileSchema =
  anchorProfileBodySchema.extend(professionalProfileExtension.shape).strict();
export type ProfessionalProfile = z.output<typeof professionalProfileSchema>;

type TeamProfileSchema = ReturnType<
  ReturnType<
    typeof anchorProfileBodySchema.extend<TeamProfileExtensionSchema["shape"]>
  >["strict"]
>;
export const teamProfileSchema: TeamProfileSchema = anchorProfileBodySchema
  .extend(teamProfileExtension.shape)
  .strict();
export type TeamProfile = z.output<typeof teamProfileSchema>;

type OrganizationProfileSchema = ReturnType<
  ReturnType<
    typeof anchorProfileBodySchema.extend<
      OrganizationProfileExtensionSchema["shape"]
    >
  >["strict"]
>;
export const organizationProfileSchema: OrganizationProfileSchema =
  anchorProfileBodySchema.extend(organizationProfileExtension.shape).strict();
export type OrganizationProfile = z.output<typeof organizationProfileSchema>;

type NullableStringSchema = z.ZodDefault<z.ZodNullable<z.ZodString>>;

const nullableString: NullableStringSchema = z
  .string()
  .nullable()
  .default(null);

type SocialPlatformSchema = ReturnType<
  (typeof anchorProfileBodySchema.shape.socialLinks)["unwrap"]
>["element"]["shape"]["platform"];

const socialPlatformSchema: SocialPlatformSchema =
  anchorProfileBodySchema.shape.socialLinks.unwrap().element.shape.platform;

export type PublicProfileViewSchema = z.ZodObject<{
  name: z.ZodString;
  organization: NullableStringSchema;
  description: NullableStringSchema;
  avatar: NullableStringSchema;
  website: NullableStringSchema;
  email: NullableStringSchema;
  socialLinks: z.ZodDefault<
    z.ZodNullable<
      z.ZodArray<
        z.ZodObject<{
          platform: SocialPlatformSchema;
          url: z.ZodString;
          label: NullableStringSchema;
        }>
      >
    >
  >;
  tagline: NullableStringSchema;
  intro: NullableStringSchema;
  story: NullableStringSchema;
  audience: NullableStringSchema;
}>;

/**
 * JSON-native public profile for site templates: the anchor profile plus the
 * common extension, with every unset field present as null.
 */
export const publicProfileViewSchema: PublicProfileViewSchema = z.object({
  name: z.string(),
  organization: nullableString,
  description: nullableString,
  avatar: nullableString,
  website: nullableString,
  email: nullableString,
  socialLinks: z
    .array(
      z.object({
        platform: socialPlatformSchema,
        url: z.string(),
        label: nullableString,
      }),
    )
    .nullable()
    .default(null),
  tagline: nullableString,
  intro: nullableString,
  story: nullableString,
  audience: nullableString,
});
export type PublicProfileView = z.output<typeof publicProfileViewSchema>;

export type ProfessionalProfileViewSchema = ReturnType<
  typeof publicProfileViewSchema.extend<{
    role: NullableStringSchema;
    expertise: z.ZodDefault<z.ZodNullable<z.ZodArray<z.ZodString>>>;
    currentFocus: NullableStringSchema;
    availability: NullableStringSchema;
  }>
>;

/** JSON-native public profile plus the professional fields. */
export const professionalProfileViewSchema: ProfessionalProfileViewSchema =
  publicProfileViewSchema.extend({
    role: nullableString,
    expertise: z.array(z.string()).nullable().default(null),
    currentFocus: nullableString,
    availability: nullableString,
  });
export type ProfessionalProfileView = z.output<
  typeof professionalProfileViewSchema
>;

/** Backward-compatible name for the always-on base profile extension. */
export const profileFrontmatterExtension: ProfileBaseFrontmatterExtension =
  profileBaseFrontmatterExtension;

export const BUILT_IN_PROFILE_KINDS: readonly ProfileKindDefinition[] = [
  {
    kind: "professional",
    category: "person",
    fields: professionalProfileFields,
    labels: { singular: "Professional", plural: "Professionals" },
  },
  {
    kind: "team",
    category: "team",
    fields: teamProfileFields,
    labels: { singular: "Team", plural: "Teams" },
  },
  {
    kind: "organization",
    category: "organization",
    fields: organizationProfileFields,
    labels: { singular: "Organization", plural: "Organizations" },
  },
];

const rawFrontmatterSchema: z.ZodRecord<z.ZodString, z.ZodUnknown> = z.record(
  z.string(),
  z.unknown(),
);

export interface ProfileValidationSelection {
  category: ProfileCategory;
  fields: z.ZodObject<z.ZodRawShape>;
}

export function validateProfileContent(
  content: string,
  selection?: ProfileValidationSelection,
): void {
  const { metadata } = parseMarkdownWithFrontmatter(
    content,
    rawFrontmatterSchema,
  );
  if (Object.hasOwn(metadata, "story")) {
    throw new Error(
      "anchor-profile story must be stored in the markdown body, not frontmatter",
    );
  }

  const selectedFields = selection?.fields.shape ?? {};
  anchorProfileBodySchema
    .extend(profileBaseFrontmatterExtension.shape)
    .extend(selectedFields)
    .strict()
    .parse(metadata);
}

/**
 * A stored profile's content check: content that fails it is invalid in
 * itself, so directory sync quarantines the file rather than retrying it and
 * leaving the placeholder to be written over it.
 */
export function validateProfileEntity(
  content: string,
  selection?: ProfileValidationSelection,
): void {
  try {
    validateProfileContent(content, selection);
  } catch (error) {
    throw new EntityValidationError("anchor-profile", error);
  }
}

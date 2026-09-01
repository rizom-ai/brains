import {
  anchorProfileBodySchema,
  type AnchorProfile,
  type ProfileCategory,
  type ProfileKindDefinition,
} from "@brains/sdk/services";
import { parseMarkdownWithFrontmatter } from "@brains/sdk/entities";
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

export interface ProfessionalProfile
  extends
    AnchorProfile,
    ProfessionalProfileExtension,
    Record<string, unknown> {}

export interface TeamProfile
  extends AnchorProfile, TeamProfileExtension, Record<string, unknown> {}

export interface OrganizationProfile
  extends
    AnchorProfile,
    OrganizationProfileExtension,
    Record<string, unknown> {}

export const professionalProfileSchema: z.ZodType<ProfessionalProfile> =
  anchorProfileBodySchema.extend(professionalProfileExtension.shape).strict();

export const teamProfileSchema: z.ZodType<TeamProfile> = anchorProfileBodySchema
  .extend(teamProfileExtension.shape)
  .strict();

export const organizationProfileSchema: z.ZodType<OrganizationProfile> =
  anchorProfileBodySchema.extend(organizationProfileExtension.shape).strict();

type PublicProfileViewObjectSchema = ReturnType<
  typeof anchorProfileBodySchema.extend<CommonProfileExtensionSchema["shape"]>
>;
export type PublicProfileViewSchema = ReturnType<
  PublicProfileViewObjectSchema["loose"]
>;

export const publicProfileViewSchema: PublicProfileViewSchema =
  anchorProfileBodySchema.extend(commonProfileExtension.shape).loose();

type ProfessionalProfileViewObjectSchema = ReturnType<
  typeof publicProfileViewSchema.extend<
    ProfessionalProfileFieldsSchema["shape"]
  >
>;
export type ProfessionalProfileViewSchema = ReturnType<
  ProfessionalProfileViewObjectSchema["loose"]
>;

export const professionalProfileViewSchema: ProfessionalProfileViewSchema =
  publicProfileViewSchema.extend(professionalProfileFields.shape).loose();

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

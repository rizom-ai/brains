import {
  anchorProfileBodySchema,
  parseMarkdownWithFrontmatter,
  type AnchorProfile,
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

export interface ProfessionalProfileExtension extends CommonProfileExtension {
  role?: string | undefined;
  expertise?: string[] | undefined;
  currentFocus?: string | undefined;
  availability?: string | undefined;
}

export type ProfessionalProfileExtensionSchema = ReturnType<
  typeof commonProfileExtension.extend<{
    role: z.ZodOptional<z.ZodString>;
    expertise: z.ZodOptional<z.ZodArray<z.ZodString>>;
    currentFocus: z.ZodOptional<z.ZodString>;
    availability: z.ZodOptional<z.ZodString>;
  }>
>;

export const professionalProfileExtension: ProfessionalProfileExtensionSchema =
  commonProfileExtension.extend({
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

export interface TeamProfileExtension extends CommonProfileExtension {
  purpose?: string | undefined;
  focusAreas?: string[] | undefined;
  capabilities?: string[] | undefined;
  workingPrinciples?: string[] | undefined;
}

export type TeamProfileExtensionSchema = ReturnType<
  typeof commonProfileExtension.extend<{
    purpose: z.ZodOptional<z.ZodString>;
    focusAreas: z.ZodOptional<z.ZodArray<z.ZodString>>;
    capabilities: z.ZodOptional<z.ZodArray<z.ZodString>>;
    workingPrinciples: z.ZodOptional<z.ZodArray<z.ZodString>>;
  }>
>;

export const teamProfileExtension: TeamProfileExtensionSchema =
  commonProfileExtension.extend({
    purpose: z.string().optional().describe("Team purpose"),
    focusAreas: z.array(z.string()).optional().describe("Team focus areas"),
    capabilities: z.array(z.string()).optional().describe("Team capabilities"),
    workingPrinciples: z
      .array(z.string())
      .optional()
      .describe("Principles guiding how the team works"),
  });

export interface OrganizationProfileExtension extends CommonProfileExtension {
  mission?: string | undefined;
  focusAreas?: string[] | undefined;
  offerings?: string[] | undefined;
  values?: string[] | undefined;
}

export type OrganizationProfileExtensionSchema = ReturnType<
  typeof commonProfileExtension.extend<{
    mission: z.ZodOptional<z.ZodString>;
    focusAreas: z.ZodOptional<z.ZodArray<z.ZodString>>;
    offerings: z.ZodOptional<z.ZodArray<z.ZodString>>;
    values: z.ZodOptional<z.ZodArray<z.ZodString>>;
  }>
>;

export const organizationProfileExtension: OrganizationProfileExtensionSchema =
  commonProfileExtension.extend({
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

export interface ProfessionalProfile
  extends AnchorProfile, ProfessionalProfileExtension, Record<string, unknown> {
  kind: "person";
}

export interface TeamProfile
  extends AnchorProfile, TeamProfileExtension, Record<string, unknown> {
  kind: "team";
}

export interface OrganizationProfile
  extends AnchorProfile, OrganizationProfileExtension, Record<string, unknown> {
  kind: "organization";
}

export const professionalProfileSchema: z.ZodType<ProfessionalProfile> =
  anchorProfileBodySchema
    .extend({
      kind: z.literal("person"),
      ...professionalProfileExtension.shape,
    })
    .strict();

export const teamProfileSchema: z.ZodType<TeamProfile> = anchorProfileBodySchema
  .extend({
    kind: z.literal("team"),
    ...teamProfileExtension.shape,
  })
  .strict();

export const organizationProfileSchema: z.ZodType<OrganizationProfile> =
  anchorProfileBodySchema
    .extend({
      kind: z.literal("organization"),
      ...organizationProfileExtension.shape,
    })
    .strict();

export const profileFrontmatterExtension: z.ZodObject<z.ZodRawShape> = z.object(
  {
    tagline: z.string().optional(),
    intro: z.string().optional(),
    audience: z.string().optional(),
    role: z.string().optional(),
    expertise: z.array(z.string()).optional(),
    currentFocus: z.string().optional(),
    availability: z.string().optional(),
    purpose: z.string().optional(),
    focusAreas: z.array(z.string()).optional(),
    capabilities: z.array(z.string()).optional(),
    workingPrinciples: z.array(z.string()).optional(),
    mission: z.string().optional(),
    offerings: z.array(z.string()).optional(),
    values: z.array(z.string()).optional(),
  },
);

const unknownFrontmatterSchema: z.ZodRecord<z.ZodString, z.ZodUnknown> =
  z.record(z.string(), z.unknown());

export function validateProfileContent(content: string): void {
  const { metadata } = parseMarkdownWithFrontmatter(
    content,
    unknownFrontmatterSchema,
  );
  if (Object.hasOwn(metadata, "story")) {
    throw new Error(
      "anchor-profile story must be stored in the markdown body, not frontmatter",
    );
  }
  const base = anchorProfileBodySchema.parse(metadata);

  switch (base.kind) {
    case "person":
      professionalProfileSchema.parse(metadata);
      return;
    case "team":
      teamProfileSchema.parse(metadata);
      return;
    case "organization":
      organizationProfileSchema.parse(metadata);
  }
}

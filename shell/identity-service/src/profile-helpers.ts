import { z } from "@brains/utils/zod";
import type { ICoreEntityService } from "@brains/entity-service";
import { AnchorProfileAdapter } from "./anchor-profile-adapter";

export interface BaseProfileExtension {
  tagline?: string | undefined;
  intro?: string | undefined;
  story?: string | undefined;
}

export type BaseProfileExtensionSchema = z.ZodObject<{
  tagline: z.ZodOptional<z.ZodString>;
  intro: z.ZodOptional<z.ZodString>;
  story: z.ZodOptional<z.ZodString>;
}>;

/**
 * Shared profile fields used by all layout packages.
 * Layout-specific extensions (e.g. expertise, availability) extend this.
 */
export const baseProfileExtension: BaseProfileExtensionSchema = z.object({
  tagline: z
    .string()
    .optional()
    .describe("Short, punchy one-liner for homepage"),
  intro: z
    .string()
    .optional()
    .describe("Optional longer introduction for homepage"),
  story: z
    .string()
    .optional()
    .describe("Extended bio/narrative (multi-paragraph markdown)"),
});

export interface ProfessionalPosition {
  companyName: string;
  title: string;
  description?: string | undefined;
  employmentType?: string | undefined;
  location?: string | undefined;
  startedOn?: string | undefined;
  finishedOn?: string | undefined;
}

export type ProfessionalPositionSchema = z.ZodObject<{
  companyName: z.ZodString;
  title: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  employmentType: z.ZodOptional<z.ZodString>;
  location: z.ZodOptional<z.ZodString>;
  startedOn: z.ZodOptional<z.ZodString>;
  finishedOn: z.ZodOptional<z.ZodString>;
}>;

export const professionalPositionSchema: ProfessionalPositionSchema = z.object({
  companyName: z.string().describe("Organization where the position was held"),
  title: z.string().describe("Title held at the organization"),
  description: z.string().optional().describe("Position summary"),
  employmentType: z.string().optional().describe("Employment type"),
  location: z.string().optional().describe("Position location"),
  startedOn: z.string().optional().describe("Start date or partial date"),
  finishedOn: z.string().optional().describe("End date or partial date"),
});

export interface ProfessionalEducation {
  schoolName: string;
  degreeName?: string | undefined;
  fieldOfStudy?: string | undefined;
  startedOn?: string | undefined;
  finishedOn?: string | undefined;
  notes?: string | undefined;
}

export type ProfessionalEducationSchema = z.ZodObject<{
  schoolName: z.ZodString;
  degreeName: z.ZodOptional<z.ZodString>;
  fieldOfStudy: z.ZodOptional<z.ZodString>;
  startedOn: z.ZodOptional<z.ZodString>;
  finishedOn: z.ZodOptional<z.ZodString>;
  notes: z.ZodOptional<z.ZodString>;
}>;

export const professionalEducationSchema: ProfessionalEducationSchema =
  z.object({
    schoolName: z.string().describe("School or educational institution"),
    degreeName: z.string().optional().describe("Degree or qualification"),
    fieldOfStudy: z.string().optional().describe("Field of study"),
    startedOn: z.string().optional().describe("Start date or partial date"),
    finishedOn: z.string().optional().describe("End date or partial date"),
    notes: z.string().optional().describe("Additional education details"),
  });

export interface ProfessionalCertification {
  name: string;
  issuingOrganization?: string | undefined;
  issuedOn?: string | undefined;
  expiresOn?: string | undefined;
  credentialId?: string | undefined;
  credentialUrl?: string | undefined;
}

export type ProfessionalCertificationSchema = z.ZodObject<{
  name: z.ZodString;
  issuingOrganization: z.ZodOptional<z.ZodString>;
  issuedOn: z.ZodOptional<z.ZodString>;
  expiresOn: z.ZodOptional<z.ZodString>;
  credentialId: z.ZodOptional<z.ZodString>;
  credentialUrl: z.ZodOptional<z.ZodString>;
}>;

export const professionalCertificationSchema: ProfessionalCertificationSchema =
  z.object({
    name: z.string().describe("Certification or credential name"),
    issuingOrganization: z
      .string()
      .optional()
      .describe("Organization that issued the credential"),
    issuedOn: z.string().optional().describe("Issue date or partial date"),
    expiresOn: z.string().optional().describe("Expiry date or partial date"),
    credentialId: z.string().optional().describe("Credential identifier"),
    credentialUrl: z.string().optional().describe("Credential URL"),
  });

export interface ProfessionalProfileExtension extends BaseProfileExtension {
  headline?: string | undefined;
  industry?: string | undefined;
  location?: string | undefined;
  skills?: string[] | undefined;
  positions?: ProfessionalPosition[] | undefined;
  education?: ProfessionalEducation[] | undefined;
  certifications?: ProfessionalCertification[] | undefined;
  expertise?: string[] | undefined;
  currentFocus?: string | undefined;
  availability?: string | undefined;
  role?: string | undefined;
  /** @deprecated Use brain-character.communicationPreferences.audience. */
  audience?: string | undefined;
  /** @deprecated Use brain-character.communicationPreferences.tone. */
  desiredTone?: string | undefined;
}

export type ProfessionalProfileExtensionSchema = ReturnType<
  typeof baseProfileExtension.extend<{
    headline: z.ZodOptional<z.ZodString>;
    industry: z.ZodOptional<z.ZodString>;
    location: z.ZodOptional<z.ZodString>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString>>;
    positions: z.ZodOptional<z.ZodArray<ProfessionalPositionSchema>>;
    education: z.ZodOptional<z.ZodArray<ProfessionalEducationSchema>>;
    certifications: z.ZodOptional<z.ZodArray<ProfessionalCertificationSchema>>;
    expertise: z.ZodOptional<z.ZodArray<z.ZodString>>;
    currentFocus: z.ZodOptional<z.ZodString>;
    availability: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodString>;
    audience: z.ZodOptional<z.ZodString>;
    desiredTone: z.ZodOptional<z.ZodString>;
  }>
>;

/**
 * Shared professional profile fields.
 *
 * The base anchor-profile schema remains brain-model agnostic. Brain models
 * and site compositions that operate on professional profiles can opt into
 * this extension explicitly.
 */
export const professionalProfileExtension: ProfessionalProfileExtensionSchema =
  baseProfileExtension.extend({
    headline: z.string().optional().describe("Public professional headline"),
    industry: z.string().optional().describe("Professional industry"),
    location: z.string().optional().describe("Professional location"),
    skills: z
      .array(z.string())
      .optional()
      .describe("Broad professional capabilities, including imported skills"),
    positions: z
      .array(professionalPositionSchema)
      .optional()
      .describe("Professional position history"),
    education: z
      .array(professionalEducationSchema)
      .optional()
      .describe("Education history"),
    certifications: z
      .array(professionalCertificationSchema)
      .optional()
      .describe("Professional certifications and credentials"),
    expertise: z
      .array(z.string())
      .optional()
      .describe("Curated areas of professional authority"),
    currentFocus: z
      .string()
      .optional()
      .describe("What you're currently working on"),
    availability: z
      .string()
      .optional()
      .describe("What you're open to (consulting, speaking, etc.)"),
    role: z
      .string()
      .optional()
      .describe("Concise professional role or working identity"),
    audience: z
      .string()
      .optional()
      .describe("Deprecated default content audience"),
    desiredTone: z
      .string()
      .optional()
      .describe("Deprecated default communication tone"),
  });

/**
 * Fetch the anchor-profile entity content.
 * Returns the raw markdown string — caller parses with their own schema
 * via AnchorProfileAdapter.parseProfileBody(content, schema).
 */
export async function fetchAnchorProfile(
  entityService: ICoreEntityService,
): Promise<string> {
  const entities = await entityService.listEntities({
    entityType: "anchor-profile",
    options: {
      limit: 1,
    },
  });
  const entity = entities[0];
  if (!entity) {
    throw new Error("Profile not found — create an anchor-profile entity");
  }
  return entity.content;
}

/**
 * Fetch the anchor-profile entity and parse its body with the given schema.
 * Combines {@link fetchAnchorProfile} with the adapter parse step that every
 * profile consumer otherwise repeats.
 */
export async function fetchAnchorProfileData<T extends Record<string, unknown>>(
  entityService: ICoreEntityService,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const content = await fetchAnchorProfile(entityService);
  return new AnchorProfileAdapter().parseProfileBody(content, schema);
}
